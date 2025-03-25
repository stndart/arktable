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
        this.contextMenu = this.createContextMenu();
        document.body.appendChild(this.contextMenu);
        this.setupContextMenu();
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

    createContextMenu() {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.innerHTML = `
            <div class="menu-item" data-action="remove-index">Remove from index</div>
        `;
        return menu;
    }

    setupContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const fileCard = e.target.closest('.file-card');
            if (fileCard && !fileCard.classList.contains("unindexed")) {
                e.preventDefault();
                this.currentFile = fileCard.querySelector('.delete-btn').dataset.file;
                this.contextMenu.style.display = 'block';
                this.contextMenu.style.left = `${e.pageX}px`;
                this.contextMenu.style.top = `${e.pageY}px`;
            }
        });

        this.contextMenu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', async () => {
                const action = item.dataset.action;
                this.contextMenu.style.display = 'none';

                if (action === 'remove-index') {
                    await this.removeIndex();
                }
            });
        });

        document.addEventListener('click', () => {
            this.contextMenu.style.display = 'none';
        });
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
        this.fileGrid.innerHTML = files.map(file => `
            <div class="file-card ${file.indexed ? '' : 'unindexed'}">
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
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteFile(btn.dataset.file);
            });
        });
    }

    async showEditModal(filename) {
        const url = new URL('/admin/files', window.location.href);
        url.searchParams.set('token', new URLSearchParams(window.location.search).get('token'));

        const response = await fetch(url);
        let files = await response.json();
        const file = files.find(f => f.filename === filename);

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
        const requiredFields = ['charName', 'charClass', 'charSubclass', 'charRarity'];
        requiredFields.forEach(id => {
            const field = document.getElementById(id);
            if (!field.value.trim()) {
                this.showFieldError(field, 'This field is required');
                isValid = false;
            } else {
                this.clearFieldError(field);
            }
        });

        // ID format validation
        const idField = document.getElementById('charId');
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

class FilterManager {
    constructor(fileManager) {
        this.fileManager = fileManager;
        this.filters = {
            class: { state: 'neutral', values: [] },
            rarity: { state: 'neutral', values: [] },
            indexed: { state: 'neutral', values: [] },
            // Will populate extra filters from metadata
        };

        this.lastScrollPos = 0;
        this.initFilters();
        this.loadFilterState();
        this.setupScrollBehavior();
    }

    initFilters() {
        this.setupCoreFilters();
        this.setupFilterEvents();
        this.setupSearch();
        this.setupStatePersistence();
    }

    setupCoreFilters() {
        // Class filter
        this.createFilterOptions('class', ['Caster', 'Defender', 'Guard', 'Medic', 'Sniper', 'Specialist', 'Supporter', 'Vanguard']);

        // Rarity filter
        this.createFilterOptions('rarity', ['4', '5', '6']);

        // Indexed filter
        this.createFilterOptions('indexed', ['indexed', 'unindexed']);

        // Extra filters
        // TODO
    }

    createFilterOptions(filterName, values) {
        const container = document.getElementById('extraFilters');
        values.forEach(value => {
            const option = document.createElement('div');
            option.className = 'filter-option';
            option.dataset.filter = filterName;
            option.dataset.value = value;
            option.textContent = filterName + ": " + value;
            container.appendChild(option);
        });
    }

    setupFilterEvents() {
        // Toggle filter states
        document.querySelectorAll('.filter-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('filter-toggle')) return;

                const filterName = item.dataset.filter;
                const currentState = item.dataset.state;
                const newState = this.getNextState(currentState);

                this.updateFilterState(filterName, newState);
                this.renderFilterState(item, newState);
            });
        });

        // Handle dropdown filter selection
        // document.getElementById('extraFilters').addEventListener('click', (e) => {
        //     const option = e.target.closest('.filter-option');
        //     if (!option) return;

        //     const filterName = option.dataset.filter;
        //     const value = option.dataset.value;
        //     this.toggleFilterValue(filterName, value);
        //     this.applyFilters();
        // });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-dropdown')) {
                document.getElementById('extraFilters').classList.remove('active');
            }
        });
    }

    getNextState(currentState) {
        const states = ['neutral', 'forced', 'discarded'];
        const currentIndex = states.indexOf(currentState);
        return states[(currentIndex + 1) % states.length];
    }

    updateFilterState(filterName, newState) {
        this.filters[filterName].state = newState;
        if (newState === 'neutral') {
            this.filters[filterName].values = [];
        }
        this.applyFilters();
        this.saveFilterState();
    }

    toggleFilterValue(filterName, value) {
        const index = this.filters[filterName].values.indexOf(value);
        if (index === -1) {
            this.filters[filterName].values.push(value);
        } else {
            this.filters[filterName].values.splice(index, 1);
        }
        this.saveFilterState();
    }

    // checkFilters(file, filterName, filter) {
    //     if (filter.state == 'neutral')
    //         return true;

    //     const fileValue = this.getFileValue(filterName, file);

    //     switch (filter.satet)
    // }

    applyFilters() {
        const filteredFiles = this.fileManager.originalFiles.filter(file => {
            return Object.entries(this.filters).every(([filterName, filter]) => {
                if (filter.state === 'neutral') return true;

                const fileValue = this.getFileValue(filterName, file);

                switch (filter.state) {
                    case 'forced':
                        return filter.values.length === 0
                            ? (fileValue !== undefined && !!fileValue)
                            : filter.values.includes(fileValue);
                    case 'discarded':
                        return filter.values.length === 0
                            ? (fileValue === undefined || !fileValue)
                            : !filter.values.includes(fileValue);
                    default:
                        return true;
                }
            });
        });
        console.log(this.filters['indexed'], filteredFiles.length);

        this.fileManager.renderFiles(filteredFiles);
    }

    getFileValue(filterName, file) {
        switch (filterName) {
            case 'class': return file.metadata?.class;
            case 'rarity': return file.metadata?.rarity?.toString();
            case 'indexed': return !!file.indexed;
            default: return file.metadata?.[filterName]?.toString();
        }
    }

    setupScrollBehavior() {
        let ticking = false;

        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    handleScroll() {
        const currentScroll = window.pageYOffset;
        const panel = document.getElementById('filterPanel');

        if (window.innerWidth <= 768) {
            if (currentScroll > this.lastScrollPos && currentScroll > 100) {
                panel.classList.add('hidden');
            } else {
                panel.classList.remove('hidden');
            }
        }

        this.lastScrollPos = currentScroll;
    }

    setupStatePersistence() {
        window.addEventListener('beforeunload', () => {
            localStorage.setItem('adminFilters', JSON.stringify(this.filters));
        });
    }

    saveFilterState() {
        localStorage.setItem('adminFilters', JSON.stringify(this.filters));
    }

    loadFilterState() {
        const savedState = localStorage.getItem('adminFilters');
        if (savedState) {
            this.filters = JSON.parse(savedState);
            this.applyFilters();
            this.renderAllFilterStates();
        }
    }

    renderAllFilterStates() {
        Object.entries(this.filters).forEach(([filterName, filter]) => {
            const item = document.querySelector(`.filter-item[data-filter="${filterName}"]`);
            if (item) {
                this.renderFilterState(item, filter.state);
            }
        });
        this.updateSelectedFiltersDisplay();
    }

    renderFilterState(item, state) {
        item.dataset.state = state;
        item.querySelector('.filter-toggle').textContent =
            state === 'forced' ? '✓' : state === 'discarded' ? '✕' : '○';
    }

    setupSearch() {
        const searchInput = document.querySelector('.filter-search');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            Array.from(document.getElementById('extraFilters').children).forEach(option => {
                const matches = option.textContent.toLowerCase().includes(searchTerm);
                option.style.display = matches ? 'block' : 'none';
            });
        });

        searchInput.addEventListener('focus', () => {
            document.getElementById('extraFilters').classList.add('active');
        });
    }

    updateSelectedFiltersDisplay() {
        const container = document.getElementById('selectedFilters');
        container.innerHTML = Object.entries(this.filters)
            .filter(([_, filter]) => filter.values.length > 0)
            .map(([name, filter]) =>
                filter.values.map(value => `
            <div class="filter-item" data-filter="${name}" data-value="${value}">
              ${name}: ${value}
              <button class="remove-filter">&times;</button>
            </div>
          `).join('')
            ).join('');

        container.querySelectorAll('.remove-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                const filterName = btn.parentElement.dataset.filter;
                const value = btn.parentElement.dataset.value;
                this.toggleFilterValue(filterName, value);
                this.applyFilters();
            });
        });
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