class GridManager {
    constructor() {
        this.isSharedPage = window.location.pathname.startsWith('/share/');
        this.isEditable = false;
        this.grid = document.getElementById('characterGrid');
        this.init();
        this.setupImport();
    }

    async init() {
        this.state = { layout: [], marks: {} };
        this.characterMap = new Map();
        await this.loadCharacters();

        this.handleDeleteBound = this.handleDelete.bind(this); // Store bound function once
        
        this.setupCoreEvents();
        if (!this.isSharedPage) {
            this.loadInitialState();
            this.setupControlButtons(); // Setup for regular page
        }
    }

    async loadInitialState() {
        await this.loadDefaultProfile();
        this.loadState();
    }

    setupCoreEvents() {
        // Drag & Drop
        this.grid.addEventListener('dragstart', this.handleDragStart.bind(this));
        this.grid.addEventListener('dragover', this.handleDragOver.bind(this));
        this.grid.addEventListener('dragend', this.handleDragEnd.bind(this));
    }

    setupControlButtons() {
        // Clean existing listeners first
        this.removeControlListeners();

        // Control Buttons
        if (!this.isSharedPage) { // to avoid overwrite local save
            document.getElementById('save').addEventListener('click', () => this.saveStateToServer());
        }
        
        this.deleteBtn = document.getElementById('deleteMode');
        this.deleteBtn.addEventListener('click', () => this.toggleDeleteMode());

        document.getElementById('loadDefault').addEventListener('click', () => this.loadDefaultProfile());
        
        // document.getElementById('addCharacter').addEventListener('click', () => this.addNewCharacter());
        document.getElementById('addCharacter').addEventListener('click', () => {
            sidebarManager.toggleSidebar();
        });

        document.getElementById('share').addEventListener('click', () => this.shareGrid());
        // document.querySelector('#importProfile input[type="file"]').addEventListener('change', async (e) => {
        //     const file = e.target.files[0];
        //     if (file) {
        //         await this.importFromFile(file);
        //         e.target.value = ''; // Reset input
        //     }
        // });

        // Check marks
        this.grid.addEventListener('click', this.handleToggle.bind(this));

        // Right-click context menu
        this.grid.addEventListener('contextmenu', e => {
            e.preventDefault();
            const cell = e.target.closest('.character-cell');
            if (cell) this.showContextMenu(cell, e.clientX, e.clientY);
        });
    }

    removeControlListeners() {
        // Clone and replace elements to remove listeners
        const cloneElement = (id) => {
            const el = document.getElementById(id);
            if (el) {
                const clone = el.cloneNode(true);
                el.parentNode.replaceChild(clone, el);
            }
        };
        
        ['save', 'addCharacter', 'deleteMode', 'loadDefault'].forEach(cloneElement);
    }

    enableEditMode() {
        this.isEditable = true;
        this.setupControlButtons();
    }

    setDraggable(enabled) {
        this.grid.querySelectorAll('.character-cell').forEach(cell => {
            cell.draggable = enabled;
        });
    }

    setupImport() {
        document.getElementById('importInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const btn = document.querySelector('.import-btn');
            btn.classList.add('loading');
            
            try {
                const data = await this.parseImportFile(file);
                await this.validateImportData(data);
                await this.applyImport(data);
                this.showSuccess('Profile imported successfully!');
            } catch (error) {
                this.showError(`Import failed: ${error.message}`);
            } finally {
                btn.classList.remove('loading');
                e.target.value = '';
            }
        });
    }
    
    parseImportFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    resolve(JSON.parse(e.target.result));
                } catch (error) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('Error reading file'));
            reader.readAsText(file);
        });
    }

    validateImportData(data) {
        const requiredKeys = ['layout', 'marks'];
        if (!requiredKeys.every(k => k in data)) {
            throw new Error('Invalid profile format');
        }
        return true;
    }

    async applyImport(data) {
        // Save to server
        await fetch('/api/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        // Reload grid
        await this.loadState();
    }

    showSuccess(message) {
        const alert = document.createElement('div');
        alert.className = 'alert success';
        alert.textContent = message;
        document.body.appendChild(alert);
        setTimeout(() => alert.remove(), 3000);
    }

    showError(message) {
        const alert = document.createElement('div');
        alert.className = 'alert error';
        alert.textContent = message;
        document.body.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    }

    handleDragStart(e) {
        if (!e.target.classList.contains('character-cell')) return;
        e.target.classList.add('dragging');
        this.dragSrcElement = e.target;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.dataset.id);
    }

    handleDragOver(e) {
        e.preventDefault();
        if (!this.dragSrcElement) return;

        const afterElement = this.getDragAfterElement(e.clientX);
        if (afterElement) {
            this.grid.insertBefore(this.dragSrcElement, afterElement);
        } else {
            this.grid.appendChild(this.dragSrcElement);
        }
    }

    handleDragEnd(e) {
        this.dragSrcElement?.classList.remove('dragging');
        this.dragSrcElement = null;
        this.saveState();
    }

    logState() {
        console.log('GridManager state:', this.state);
    }

    async loadDefaultProfile() {
        // console.log("Loading default profile.");

        try {
            // Load data
            const [profileRes] = await Promise.all([
                fetch('/data/profiles/default.json')
            ]);
            
            // ensure characters are loaded
            if (!await this.ensureCharactersLoaded()) {
                console.error("Interrupting loading default profile.");
                return; // If characters are not loaded, exit early
            }
        
            const profile = await profileRes.json();
            // console.log("Loaded default layout:", profile.layout);

            this.applyLayout(profile.layout);

            this.state.layout = profile.layout;
            this.state.marks = profile.marks;
            this.applyState();
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    }

    async loadCharacterData() {
        const response = await fetch('/api/characters');
        const data = await response.json();
        return data.characters;
    }

    async loadCharacters() {
        try {
            const response = await fetch('/api/characters');
            const { characters } = await response.json();
            this.characters = characters;
            // Create ID map for quick lookup
            this.characterMap = new Map(this.characters.map(c => [c.id, c]));
        } catch (error) {
            console.error('Error loading characters:', error);
        }
    }

    async ensureCharactersLoaded() {
        if (!this.characters || this.characters.length === 0 || !this.characterMap) {
            await this.loadCharacters(); // Ensure characters are loaded
            console.log("onload", this.characterMap);
        }
    
        if (!this.characters || this.characters.length === 0 || !this.characterMap) {
            console.error("Characters could not be loaded.");
            return false; // Return false to signal failure
        }
    
        return true; // Return true if characters are loaded
    }

    createCharacterCell(character) {
        // console.log(`adding character ${character.id}`);

        const cell = document.createElement('div');
        cell.className = 'character-cell';
        cell.dataset.id = character.id;
        cell.draggable = true;

        cell.innerHTML = `
            <div class="check-mark" style="display: none;"></div>
            <img src="/characters/${character.image}" class="character-image">
            <div class="circles">
                <div class="circle"></div>
                <div class="circle"></div>
                <div class="circle"></div>
            </div>
        `;

        return cell;
    }

    toggleDeleteMode() {
        const isActive = this.deleteBtn.classList.toggle('destruction-on');
        this.grid.classList.toggle('delete-mode', isActive);
        this.deleteBtn.textContent = isActive ? 'Cancel Delete' : 'Delete Mode';
    
        // Add or remove click handler depending on the state
        if (isActive) {
            this.grid.addEventListener('click', this.handleDeleteBound);
        } else {
            this.grid.removeEventListener('click', this.handleDeleteBound);
        }
    }
    
    handleDelete(e) {
        const cell = e.target.closest('.character-cell');
        if (cell) {
            cell.remove();
            this.saveState();
        }
    }

    handleToggle(e) {
        const cell = e.target.closest('.character-cell');
        if (cell) this.toggleCheckMark(cell);
    }
    
    getDragAfterElement(horizontalPosition) {
        const draggableElements = [...this.grid.querySelectorAll('.character-cell:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = horizontalPosition - box.left - box.width / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async addNewCharacter() {
        // Filter out characters already in layout
        const availableCharacters = this.characters.filter(c =>
            !this.state.layout.some(l => l === c.id)
        );
    
        if (availableCharacters.length === 0) {
            console.warn("No available characters to add");
            return;
        }
    
        // Pick random character
        const randomIndex = Math.floor(Math.random() * availableCharacters.length);
        const newChar = availableCharacters[randomIndex];
    
        const cell = this.createCharacterCell(newChar);
        this.grid.appendChild(cell);
        this.state.layout.push(newChar.id);
        await this.saveState();
    }

    addCharacterById(charId) {
        const character = this.characters.find(c => c.id === charId);
        if (character && !this.state.layout.some(l => l === character.id)) {
            const cell = this.createCharacterCell(character);
            this.grid.appendChild(cell);
            this.state.layout.push(character.id);
            this.saveState();
        }
    }
    
    toggleCheckMark(cell) {
        const checkMark = cell.querySelector('.check-mark');
        checkMark.style.display = checkMark.style.display === 'none' ? 'block' : 'none';
        this.saveState();
    }

    showContextMenu(cell, x, y) {
        // Remove existing menus
        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        
        menu.innerHTML = `
            <div class="context-item" onclick="gridManager.addCircle('${cell.dataset.id}')">Add Circle</div>
            <div class="context-item" onclick="gridManager.removeCircle('${cell.dataset.id}')">Remove Circle</div>
        `;
        
        document.body.appendChild(menu);
        
        // Close menu on click outside
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        });
    }

    // Add a circle (increase the count)
    addCircle(charId) {
        const circles = this.grid.querySelector(`[data-id="${charId}"] .circles`).children;
        for (let circle of circles) {
            if (!circle.classList.contains('show')) {
                circle.classList.add('show');
                break;
            }
        }
        this.saveState();
    }

    // Remove a circle (decrease the count)
    removeCircle(charId) {
        const circles = [...this.grid.querySelector(`[data-id="${charId}"] .circles`).children].reverse();
        for (let circle of circles) {
            if (circle.classList.contains('show')) {
                circle.classList.remove('show');
                break;
            }
        }
        this.saveState();
    }

    applyLayout() {
        // Clear existing grid
        this.grid.innerHTML = '';
        
        // Add unique characters in order
        const uniqueIDs = [...new Set(this.state.layout)];
        uniqueIDs.forEach(charId => {
            if (this.characterMap.has(charId)) {
                const cell = this.createCharacterCell(this.characterMap.get(charId));
                this.grid.appendChild(cell);
            }
        });
    }

    async loadState(externalState) {
        let state;

        if (externalState) {
            console.log("Loading state from share id.");
            state = externalState;
        } else {
            console.log("Loading state from cookies.");

            const cookieState = document.cookie.match(/userState=([^;]+)/);
            if (cookieState) {
                state = JSON.parse(decodeURIComponent(cookieState[1]));
            }
        }
        
        if (state) {
            this.state = state;
            this.applyLayout();
            this.applyState();

            this.logState();
        }
        else {
            console.error("Empty state.")
        }
        
    }

    applyState() {
        // Apply check marks and circles
        Object.entries(this.state.marks).forEach(([id, marks]) => {
            const cell = this.grid.querySelector(`[data-id="${id}"]`);
            if (cell) {
                cell.querySelector('.check-mark').style.display = marks.checks ? 'block' : 'none';

                // Update circle visibility
                const circles = cell.querySelectorAll('.circle');
                circles.forEach((circle, i) => {
                    if (i < marks.circles) {
                        circle.classList.add('show');  // Show circle
                    } else {
                        circle.classList.remove('show');  // Hide circle
                    }
                });
            }
        });
    }

    async saveState() {
        // Collect current state
        const state = {
            layout: [...this.grid.children].map(cell => cell.dataset.id),
            marks: {}
        };

        this.grid.querySelectorAll('.character-cell').forEach(cell => {
            const id = cell.dataset.id;
            state.marks[id] = {
                checks: cell.querySelector('.check-mark').style.display === 'block',

                // Count how many circles have the 'show' class (i.e., are visible)
                circles: [...cell.querySelectorAll('.circle')].filter(c => c.classList.contains('show')).length
            };
        });

        this.state = state;
    }

    async saveStateToServer() {
        // Save to cookie and server
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.state)
        });
    }
    
    async shareGrid(mode = 'readwrite') {
        const state = this.state;
        try {
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state, mode })
            });
            const { shareId } = await response.json();
            this.showShareDialog(shareId, mode);
        } catch (error) {
            console.error('Sharing failed:', error);
        }
    }

    showShareDialog(shareId, mode) {
        const baseUrl = `${window.location.origin}/share/${shareId}`;
        const readWriteUrl = `${baseUrl}?edit=true`;
        const readOnlyUrl = `${baseUrl}`;
        
        const dialog = document.createElement('div');
        dialog.className = 'share-dialog';
        dialog.innerHTML = `
            <h3>Share Link</h3>
            <div class="share-options">
                <div>
                    <label>Read-Write:</label>
                    <input type="text" value="${readWriteUrl}" readonly>
                    <button onclick="navigator.clipboard.writeText('${readWriteUrl}')">Copy</button>
                </div>
                <div>
                    <label>Read-Only:</label>
                    <input type="text" value="${readOnlyUrl}" readonly>
                    <button onclick="navigator.clipboard.writeText('${readOnlyUrl}')">Copy</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
    }

    exportToFile() {
        const state = this.state;
        const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `grid-profile-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async importFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const state = JSON.parse(e.target.result);
                    await this.loadState(state);
                    resolve();
                } catch (error) {
                    reject('Invalid profile file');
                }
            };
            reader.readAsText(file);
        });
    }
}

// Initialize with share manager
window.onload = () => {
    window.gridManager = new GridManager();
    if (window.location.pathname.startsWith('/share')) {
        new ShareManager(window.gridManager);
    }
    sidebarManager = new SidebarManager(window.gridManager);

    // Add profile loading button handler
    document.getElementById('loadDefault').addEventListener('click', async () => {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.textContent = 'Loading Default Profile...';
        document.body.appendChild(overlay);
    
        await window.gridManager.loadDefaultProfile();
        overlay.remove();
    });
};