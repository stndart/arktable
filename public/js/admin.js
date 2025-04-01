class AdminManager {
    constructor() {
        // Verify admin access
        // Get token from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.adminToken = urlParams.get('token');

        // Validate token presence
        if (!this.adminToken) {
            window.location.href = '/';
            return;
        }

        this.form = document.getElementById('adminForm');
        this.initEventListeners();
    }

    initEventListeners() {
        this.form.addEventListener('submit', async e => {
            e.preventDefault();
            const formData = new FormData(this.form);

            try {
                const response = await fetch('/admin/add', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`
                    },
                    body: formData
                });

                console.log(response);

                if (response.ok) {
                    alert('Character added successfully!');
                    this.form.reset();
                } else {
                    if (response.status === 403) {
                        alert('Unauthorized! You do not have permission to add characters.');
                    } else if (response.status === 400) {
                        alert('Duplicate character! A character with this name already exists.');
                    } else {
                        alert('Error adding character.');
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to add character');
            }
        });
    }
}

class FileManager {
    constructor() {
        // Get token from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.adminToken = urlParams.get('token');

        this.subclasses = {};
        this.loadSubclasses();

        // Add original files reference
        this.originalFiles = [];

        // Initialize filter manager after loading files
        this.loadFiles().then(() => {
            this.filterManager = new FilterManager(this);
        });

        this.fileGrid = document.getElementById('fileGrid');
        this.editModal = document.getElementById('editModal');
        this.init();
    }

    async loadSubclasses() {
        try {
            const response = await fetch('/api/subclasses');
            this.subclasses = await response.json();
        } catch (error) {
            console.error('Failed to load subclasses:', error);
        }
    }

    async init() {
        await this.loadFiles();
        this.setupFilters();
        this.setupModal();
    }

    setupContextMenu(menu) {
        menu.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', async () => {
                const action = item.dataset.action;
                menu.style.display = 'none';

                switch (action) {
                    case 'upload-skin':
                        this.handleUploadSkin();
                        break;

                    case 'set-default':
                        this.handleSetDefault();
                        break;
                }
            });
        });

        // Close menu on click outside
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        });
    }

    showContextMenu(e, x, y) {
        // Remove existing menus
        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());

        const fileCard = e.target.closest('.file-card');
        if (fileCard && !fileCard.classList.contains("unindexed")) {

            console.log(fileCard);
            this.currentFile = fileCard.querySelector('.delete-btn').dataset.file;
            this.currentCharacter = fileCard.dataset.characterId;
            this.isDefaultSkin = fileCard.dataset.isDefault === 'true';

            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            menu.innerHTML = `
            <div class="context-item" data-action="upload-skin">
                Upload New Skin
            </div>
            <div class="context-item" data-action="set-default">
                Set as Default Skin
            </div>
        `;

            // Update menu item states
            const setDefaultItem = menu.querySelector('[data-action="set-default"]');
            setDefaultItem.classList.toggle('disabled', this.isDefaultSkin);

            console.log('default?', this.isDefaultSkin);

            document.body.appendChild(menu);

            this.setupContextMenu(menu);
        }
    }

    async handleUploadSkin() {
        const fileCard = document.querySelector(`[data-file="${this.currentFile}"]`);
        fileCard?.classList.add('updating');

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.png';
        input.onchange = async (e) => {
            const file = e.target.files[0];

            if (!file) return;

            const formData = new FormData();
            formData.append('skin', file);
            formData.append('characterId', this.currentCharacter);

            try {
                const response = await fetch('/admin/upload-skin', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`
                    },
                    body: formData
                });

                if (!response.ok) throw new Error('Upload failed');

                await this.loadFiles();
                this.showSuccessMessage('Skin uploaded successfully');

            } catch (error) {
                this.showErrorMessage(`Upload failed: ${error.message}`);
            }
        };

        input.click();
        fileCard?.classList.remove('updating');
    }

    async handleSetDefault() {
        try {
            const fileCard = document.querySelector(`[data-file="${this.currentFile}"]`);
            fileCard?.classList.add('updating');

            const response = await fetch('/admin/set-default-skin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.adminToken}`
                },
                body: JSON.stringify({
                    characterId: this.currentCharacter,
                    filename: this.currentFile
                })
            });

            if (!response.ok) throw new Error('Set default failed');

            await this.loadFiles();
            this.showSuccessMessage('Default skin updated');

        } catch (error) {
            this.showErrorMessage(`Set default failed: ${error.message}`);
        } finally {
            fileCard?.classList.remove('updating');
        }
    }

    async removeIndex() {
        try {
            await fetch('/admin/remove-index', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.adminToken}`
                },
                body: JSON.stringify({ filename: this.currentFile })
            });
            await this.loadFiles();
        } catch (error) {
            console.error('Toggle index failed:', error);
        }
    }

    async loadFiles(filter = 'all') {
        try {
            const url = new URL('/admin/files', window.location.href);
            url.searchParams.set('token', new URLSearchParams(window.location.search).get('token'));

            const response = await fetch(url);
            // let files = await response.json();
            this.originalFiles = await response.json();
            this.filterManager?.applyFilters();
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    }

    renderFiles(files) {
        console.log(`rendering ${files.length} files`);

        this.fileGrid.innerHTML = files.map(file => `
            <div class="file-card ${file.indexed ? '' : 'unindexed'}"
                    data-character-id="${file.metadata?.id}"
                    data-is-default="${file.metadata?.skins?.default === file.filename}">
                <button class="delete-btn" data-file="${file.filename}">&times;</button>
                <img src="/characters/${file.filename}" 
                     class="file-preview"
                     data-file="${file.filename}">
                <div class="file-info">
                    ${file.indexed ? `
                        <div><strong>${file.metadata.name}</strong></div>
                        <div>${file.metadata.class} • ${file.metadata.rarity}★</div>
                        <div>${file.metadata.subclass}</div>
                    ` : '<div class="unindexed-label">Not Indexed</div>'}
                </div>
            </div>
        `).join('');

        // Update event listeners
        document.querySelectorAll('.file-preview').forEach(img => {
            img.addEventListener('click', () => this.showEditModal(img.dataset.file));
            img.addEventListener('contextmenu', e => {
                e.preventDefault();
                const cell = e.target.closest('.file-preview');
                if (cell) this.showContextMenu(e, e.clientX, e.clientY);
            });
        });

        // Right-click context menu
        this.grid

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.file);
            });
        });
    }

    async showEditModal(filename) {
        const file = this.originalFiles.find(f => f.filename === filename);
        // const isSkin = !!this.originalFiles.find(f => 
        //   f.metadata?.skins?.alternates.includes(filename)
        // );

        const form = document.getElementById('metadataForm');
        form.reset();

        document.getElementById('originalFile').value = filename;
        document.getElementById('charId').value = file?.metadata?.id ||
            filename.replace(/\.png$/, '').toLowerCase();
        document.getElementById('charName').value = file?.metadata?.name || '';
        document.getElementById('charClass').value = file?.metadata?.class || '';
        document.getElementById('charRarity').value = file?.metadata?.rarity?.toString() || '4';

        this.setupClassSubclassBinding();
        this.updateSubclassOptions(file?.metadata?.class);
        document.getElementById('charSubclass').value = file?.metadata?.subclass || '';

        this.editModal.style.display = 'block';
    }

    setupClassSubclassBinding() {
        const classSelect = document.getElementById('charClass');
        classSelect.addEventListener('change', () => {
            this.updateSubclassOptions(classSelect.value);
        });
    }

    updateSubclassOptions(className) {
        const subclassSelect = document.getElementById('charSubclass');
        subclassSelect.innerHTML = '';

        if (this.subclasses[className]) {
            this.subclasses[className].forEach(subclass => {
                const option = document.createElement('option');
                option.value = subclass;
                option.textContent = subclass;
                subclassSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No subclasses available';
            option.disabled = true;
            subclassSelect.appendChild(option);
        }
    }

    async deleteFile(filename) {
        if (!confirm(`Permanently delete ${filename}?`)) return;

        try {
            const url = new URL('/admin/delete-file', window.location.href);
            url.searchParams.set('token', new URLSearchParams(window.location.search).get('token'));
            await fetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            await this.loadFiles();
        } catch (error) {
            alert('Delete failed');
        }
    }

    setupFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');
                this.loadFiles(btn.dataset.filter);
            });
        });
    }

    setupModal() {
        const closeModal = () => this.editModal.style.display = 'none';

        document.querySelector('.close-btn').addEventListener('click', closeModal);
        window.onclick = (e) => e.target === this.editModal && closeModal();

        this.metadataForm = document.getElementById('metadataForm');
        this.metadataForm.addEventListener('submit', this.handleSubmit.bind(this));
        document.querySelector(".save-btn").addEventListener("click", function () {
            document.getElementById('metadataForm').dispatchEvent(new Event('submit'));
        }); // cursed
    }

    validateForm(form) {
        let isValid = true;

        // Required fields
        const idField = document.getElementById('charId');
        let requiredFields;
        if (this.originalFiles.some(file => file.metadata?.id === idField.value)) // adding skin
            requiredFields = [];
        else
            requiredFields = ['charName', 'charClass', 'charSubclass', 'charRarity'];

        requiredFields.forEach(id => {
            const field = document.getElementById(id);
            if (!field?.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        // ID format validation
        if (!/^[_a-z0-9\-]+$/.test(idField.value)) {
            this.showFieldError(idField, 'Only lowercase letters allowed');
            isValid = false;
        }

        return isValid;
    }

    showFieldError(field, message) {
        const errorElement = field.parentElement.querySelector('.error-message') ||
            document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        errorElement.style.color = '#ff4444';
        errorElement.style.fontSize = '0.8rem';
        field.parentElement.appendChild(errorElement);
        field.style.borderColor = '#ff4444';
    }

    clearFieldError(field) {
        const errorElement = field.parentElement.querySelector('.error-message');
        if (errorElement) errorElement.remove();
        field.style.borderColor = '#ddd';
    }

    async handleSubmit(e) {
        e.preventDefault();

        const form = document.getElementById('metadataForm');
        if (!this.validateForm(form)) return;

        const formData = {
            originalFile: document.getElementById('originalFile').value,
            id: document.getElementById('charId').value,
            name: document.getElementById('charName').value,
            class: document.getElementById('charClass').value,
            subclass: document.getElementById('charSubclass').value,
            rarity: document.getElementById('charRarity').value
        };

        try {
            const response = await fetch('/admin/update-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.adminToken}`
                },
                body: JSON.stringify(formData)
            });
            const { error } = await response.json();

            if (!response.ok) {
                if (response.status == 400 && error == "Character with this id already exists") {
                    this.showErrorMessage(error);
                    console.error(error);
                    return;
                }
                else {
                    throw new Error('Update failed: ' + response.error);
                }
            }

            // Close modal and refresh list
            this.closeModal();
            await this.loadFiles();
            this.showSuccessMessage('Changes saved!');

        } catch (error) {
            this.showErrorMessage(`Save failed: ${error.message}`);
            console.error('Submission error:', error);
        }
    }

    closeModal() {
        this.editModal.style.display = 'none';
        this.metadataForm.reset();
    }

    showSuccessMessage(text) {
        window.messageManager.showMessage('success', text);
    }

    showErrorMessage(text) {
        window.messageManager.showMessage('error', text);
    }
}

// Initialize admin manager
new AdminManager();

// Initialize after admin auth
document.addEventListener('DOMContentLoaded', () => {
    window.charManager = new FileManager();

    // Handle mobile viewport resize
    window.addEventListener('resize', () => {
        const panel = document.getElementById('filterPanel');
        if (window.innerWidth > 768) {
            panel.classList.remove('hidden');
        }
    });
});