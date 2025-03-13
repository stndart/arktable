class GridManager {
    constructor() {
        this.token = localStorage.getItem('jwt');
        this.isLoggedIn = false;
        this.userId = null;

        this.isSharedPage = window.location.pathname.startsWith('/shared/');
        this.isPersistentShare = window.location.pathname.startsWith('/shared/user/');
        this.shareId = this.getShareIdFromURL();
        
        this.isEditable = !this.isSharedPage;
        if (this.isSharedPage) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('edit') === 'true') {
                this.isEditable = true;
            }
            else {
                this.isEditable = false;
            }
        }
        console.log("is editable?", this.isEditable);

        this.grid = document.getElementById('characterGrid');

        this.loadingState = {
            characters: false,
            profile: false
        };
        this.cellCache = new Map(); // Add this line

        this.shareManager = new ShareManager(this);

        // Bind share button click
        document.getElementById('share').addEventListener('click', () => {
            this.shareManager.show();
        });

        this.init_basic();
        this.setupImport();
    }

    async init_basic() {
        this.state = { layout: [], marks: {} };
        this.characterMap = new Map();

        this.handleDeleteBound = this.handleDelete.bind(this); // Store bound function once

        if (this.isEditable) {
            this.setupCoreEvents();
        }
        if (!this.isSharedPage) {
            this.setupControlButtons(); // Setup for regular page
        }
    }

    async initialize() {
        console.log('initialize with shared?', this.isSharedPage);
        if (this.isSharedPage) {
            await this.loadSharedData();
        } else {
            await this.loadUserData();
        }
    }

    async loadUserData() {
        this.showLoading(true);

        try {
            // Load characters first
            await this.loadCharacters();

            // Then load profile/state
            if (this.isLoggedIn) {
                await this.loadProfile();
            } else {
                await this.loadState();
            }

        } catch (error) {
            console.error('loadUserData failed:', error);
        } finally {
            this.showLoading(false);
        }
    }

    async loadSharedData() {
        console.log("loading shared data");

        const endpoint = this.isPersistentShare
            ? `/api/shared/user/${this.shareId}`
            : `/api/shared/${this.shareId}`;

        try {
            const response = await fetch(endpoint);
            this.state = await response.json();
            await this.loadCharacters();
            this.applyLayout();
        } catch (error) {
            console.error('Failed to load shared data:', error);
            this.showError(
                this.isPersistentShare
                    ? 'Could not load persistent grid'
                    : 'Shared snapshot expired or invalid'
            );
            setTimeout(() => window.location = '/', 3000);
        }
    }

    getShareIdFromURL() {
        const pathParts = window.location.pathname.split('/');
        if (this.isPersistentShare) return pathParts[3]; // user ID
        return pathParts[2]; // snapshot ID
    }

    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    async initializeAuth() {
        if (!this.token) {
            this.clearAuth();
            return;
        };

        try {
            const { valid, userId } = await this.validateToken(this.token);
            this.isLoggedIn = valid;
            this.userId = userId;

            if (!valid) {
                localStorage.removeItem('jwt');
            }
        } catch (error) {
            console.error('Auth validation failed:', error);
            this.clearAuth();
        }
    }

    async validateToken(token) {
        const response = await fetch('/api/validate-token', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return { valid: false };

        const data = await response.json();
        return {
            valid: data.valid,
            userId: data.userId
        };
    }

    clearAuth() {
        this.token = null;
        this.isLoggedIn = false;
        this.userId = null;
        localStorage.removeItem('jwt');
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
            document.getElementById('save').addEventListener('click', () => this.saveState());
        }

        this.deleteBtn = document.getElementById('deleteMode');
        this.deleteBtn.addEventListener('click', () => this.toggleDeleteMode());

        document.getElementById('loadDefault').addEventListener('click', () => this.loadDefaultProfile());

        document.getElementById('addCharacter').addEventListener('click', () => {
            sidebarManager.toggleSidebar();
        });

        // document.getElementById('share').addEventListener('click', () => this.shareGrid());

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
        console.log("is editable now?", this.isEditable);
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
        const response = await fetch('/api/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        // Reload grid after confirmation
        if (response.ok) {
            await this.loadState();
        }
    }

    showSuccess(message) {
        window.messageManager.showMessage('success', message);
    }

    showError(message) {
        window.messageManager.showMessage('error', message);
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
    
        const afterElement = this.getDragAfterElement(e.clientX, e.clientY);
        const gridRect = this.grid.getBoundingClientRect();
        
        if (afterElement) {
            // Get bounding rect of the potential sibling
            const afterElementRect = afterElement.getBoundingClientRect();
            
            // Determine insert position based on mouse position
            if (e.clientX < afterElementRect.left + afterElementRect.width / 2) {
                this.grid.insertBefore(this.dragSrcElement, afterElement);
            } else {
                this.grid.insertBefore(this.dragSrcElement, afterElement.nextSibling);
            }
        } else {
            // Add to end of grid
            this.grid.appendChild(this.dragSrcElement);
        }
    }

    handleDragEnd(e) {
        this.dragSrcElement?.classList.remove('dragging');
        this.dragSrcElement = null;
        this.saveState();
    }

    getDragAfterElement(x, y) {
        const draggableElements = [...this.grid.querySelectorAll('.character-cell:not(.dragging)')];
        
        // Sort elements by their visual position (top -> bottom, left -> right)
        const sortedElements = draggableElements.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.top - bRect.top || aRect.left - bRect.left;
        });
    
        return sortedElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            
            // Calculate distance from mouse to element center
            const offsetX = x - centerX;
            const offsetY = y - centerY;
            const distance = Math.sqrt(offsetX ** 2 + offsetY ** 2);
    
            // Check if closer than previous closest
            if (distance < closest.distance) {
                return { 
                    distance: distance,
                    element: child,
                    offsetX: offsetX,
                    offsetY: offsetY
                };
            }
            return closest;
        }, { distance: Infinity, element: null, offsetX: 0, offsetY: 0 }).element;
    }

    logState() {
        console.log('GridManager state:', this.state);
    }

    async loadCharacters() {
        // console.log("loadCharacters");
        this.loadingState.characters = true;

        try {
            const response = await fetch('/api/characters');
            const { characters } = await response.json();
            this.characters = characters;
            // Create ID map for quick lookup
            this.characterMap = new Map(this.characters.map(c => [c.id, c]));
        } catch (error) {
            console.error('Error loading characters:', error);
        } finally {
            this.loadingState.characters = false;
        }
    }

    async ensureCharactersLoaded() {
        if (!this.characters || this.characters.length === 0 || !this.characterMap) {
            await this.loadCharacters(); // Ensure characters are loaded
            console.log("CharacterMap", this.characterMap);
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

    async loadDefaultProfile() {
        // console.log("Loading default profile.");

        try {
            // Load data
            const [profileRes] = await Promise.all([
                fetch('/default_profile')
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
        } catch (error) {
            console.error('Error loading default profile:', error);
        }
    }

    async loadProfile() {
        if (!this.isLoggedIn)
            throw new Error("Shouldn't have called loadProfile while not logged in!");

        this.loadingState.profile = true;

        try {
            const response = await fetch('/api/profile', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            this.state = await response.json();
            this.applyLayout();
        } finally {
            this.loadingState.profile = false;
        }

    }

    async loadState(externalState) {
        let state;

        if (externalState) {
            console.log("Loading state from share id.");
            state = externalState;
        } else {
            console.log("Loading state from localStorage.");

            const localStorageState = localStorage.getItem('gridState');
            if (localStorageState) {
                state = JSON.parse(localStorageState);
            }
        }

        if (state) {
            this.state = state;
            this.applyLayout();

            // console.log("state applied");
            // this.logState();
        }
        else {
            console.error("Empty state.")
        }

    }

    applyLayout() {
        // Add visual placeholders first
        this.grid.innerHTML = this.state.layout
            .map(() => `<div class="cell-placeholder"></div>`)
            .join('');

        // Then populate with actual data
        requestAnimationFrame(() => {
            this.grid.innerHTML = '';

            const uniqueIDs = [...new Set(this.state.layout)];
            this.cellCache = new Map(); // Track created cells

            uniqueIDs.forEach(charId => {
                if (this.characterMap.has(charId)) {
                    const character = this.characterMap.get(charId);
                    const cell = this.createCharacterCell(character);
                    this.cellCache.set(charId, cell); // Store reference
                    this.grid.appendChild(cell);
                }
            });

            this.applyState();
        });
    }

    applyState() {
        Object.entries(this.state.marks).forEach(([id, marks]) => {
            const cell = this.cellCache.get(id); // Use cached cells

            if (cell) {
                const checkMark = cell.querySelector('.check-mark');
                const circles = cell.querySelectorAll('.circle');

                // Apply check mark
                checkMark.style.display = marks.checks ? 'block' : 'none';

                // Apply circles
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

    getCurrentState() {
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

        return state;
    }

    async saveState() {
        const state = this.getCurrentState();
        // console.log("save state, shared?", this.isSharedPage, "logged in?", this.isLoggedIn);

        // For shared pages in edit mode
        if (this.isSharedPage && this.isEditable) {
            return this.saveSharedState(state);
        }

        // Regular save flow
        if (!this.isSharedPage) {
            if (this.isLoggedIn) {
                await this.saveToServer(state);
            }
            localStorage.setItem('gridState', JSON.stringify(state));
            // console.log("Saved to local storage");
        }
    }

    async saveToServer(state) {
        if (this.isSharedPage && !this.isPersistentShare) {
            await this.saveSnapshotToServer(state);
            return;
        }

        const c_userId = (this.userId) ? this.userId : this.shareId;
        // console.log("saving to server", c_userId);

        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                state,
                userId: c_userId
            })
        });

        if (!response.ok) throw new Error('Save failed');
    }

    async saveSnapshotToServer(state) {
        // console.log("saving snapshot to server", this.shareId, state);

        const response = await fetch('/api/save-shared', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                state,
                snapshotId: this.shareId
            })
        });

        if (!response.ok) throw new Error('Snapshot save failed');
    }

    async saveSharedState(state) {
        if (this.isPersistentShare) {
            // Save to original user's profile
            await this.saveToServer(state);
        } else {
            // Save snapshot edits on server
            await this.saveSnapshotToServer(state);
        }
    }

    async createSnapshot(state) {
        const response = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        });
        return response.json();
    }

    async shareSnapshot(state, editable) {
        const { shareId } = await this.createSnapshot(state);
        return `${window.location.origin}/shared/${shareId}${editable ? '?edit=true' : ''}`;
    }

    async sharePersistent(editable) {
        if (!this.isSharedPage) {
            return `${window.location.origin}/shared/user/${this.userId}${editable ? '?edit=true' : ''}`;
        
        } else if (this.isPersistentShare) {
            return `${window.location.origin}/shared/user/${this.shareId}${(editable && this.isEditable) ? '?edit=true' : ''}`;
        
        } else {
            return `${window.location.origin}/shared/${this.shareId}${(editable && this.isEditable) ? '?edit=true' : ''}`;
        }
    }

    updateSharedUrl(newShareId) {
        const newUrl = `/shared/${newShareId}${this.isEditable ? '?edit=true' : ''}`;
        window.history.replaceState({}, '', newUrl);
        this.shareId = newShareId;
    }

    async shareGrid() {
        console.log("share button pressed");
        const state = this.state;

        try {
            let baseUrl;
            if (this.isLoggedIn) {
                baseUrl = `${window.location.origin}/shared/user/${this.userId}`;
            }
            else {
                const response = await fetch('/api/share', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state })
                });
                const { shareId } = await response.json();
                baseUrl = `${window.location.origin}/shared/${shareId}`;
            }

            this.showShareDialog(baseUrl);

        } catch (error) {
            console.error('Sharing failed:', error);
        }
    }

    showShareDialog(shareUrl) {
        const readWriteUrl = `${shareUrl}?edit=true`;
        const readOnlyUrl = `${shareUrl}`;

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
document.addEventListener('DOMContentLoaded', async () => {
    window.gridManager = new GridManager();

    try {
        await gridManager.initializeAuth(); // Critical auth check
        await gridManager.initialize();

    } catch (error) {
        console.error('Initialization error:', error);
        gridManager.showError('Failed to load data');
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
});