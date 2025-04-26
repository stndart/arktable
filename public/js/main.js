class GridManager {
    constructor() {
        this.token = localStorage.getItem('jwt');
        this.isLoggedIn = false;
        this.userId = null;

        this.isSharedPage = window.location.pathname.startsWith('/shared/');
        this.isPersistentShare = window.location.pathname.startsWith('/shared/user/');
        this.shareId = this.getShareIdFromURL();

        this.longPressTimer = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isDrag = false;
        this.preventDrag = false;
        this.DRAG_THRESHOLD = 16; // Minimum movement in pixels to consider it a drag
        this.LONG_PRESS_DURATION = 1200; // ms

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

        this.originalFiles = []; // Will store all characters
        this.filteredFiles = []; // Current filtered characters

        this.loadingState = {
            characters: false,
            profile: false
        };
        this.cellCache = new Map();

        // Original state with all characters
        this.trueState = {
            layout: [], // Original order
            marks: {},
            skins: {} // Stores { [characterId]: skinFileName }
        };

        // Bind share button click
        document.getElementById('share').addEventListener('click', () => {
            this.shareManager.show();
        });

        this.init_basic();
        this.setupImport();

        this.shareManager = new ShareManager(this);
        this.filterManager = new FilterManager(this);
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    async init_basic() {
        this.characterMap = new Map();

        this.handleDeleteBound = this.handleDelete.bind(this); // Store bound function once
        this.handleToggleBound = this.handleToggle.bind(this); // Store bound function once

        if (this.isEditable) {
            this.setupCoreEvents();
        }
        if (!this.isSharedPage) {
            this.setupControlButtons(); // Setup for regular page
        }
    }

    async initialize() {
        console.log('initialize with shared?', this.isSharedPage);

        await this.loadCharacters();
        this.filterManager.initFilters();

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
            this.trueState = await response.json();
            await this.loadCharacters();
            this.filterManager.applyFilters();
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
        // Add touch event listeners for mobile
        // if ('ontouchstart' in window) {
        if (this.isMobileDevice()) {
            this.grid.addEventListener('touchstart', this.handleTouchStart.bind(this));
            this.grid.addEventListener('touchmove', this.handleTouchMove.bind(this));
            this.grid.addEventListener('touchend', this.handleTouchEnd.bind(this));
        }
        else {
            // Keep existing desktop drag events
            this.grid.addEventListener('dragstart', this.handleDragStart.bind(this));
            this.grid.addEventListener('dragover', this.handleDragOver.bind(this));
            this.grid.addEventListener('dragend', this.handleDragEnd.bind(this));
        }
    }

    handleTouchStart(e) {
        if (!this.isEditable) return;

        const touch = e.touches[0];
        const cell = touch.target.closest('.character-cell');
        if (!cell) return;

        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.isDrag = false;
        this.preventDrag = false;

        // Start long press timer
        this.longPressTimer = setTimeout(() => {
            if (!this.isDrag) {
                console.log('touch tieout', this.LONG_PRESS_DURATION);
                this.preventDrag = true;
                this.showContextMenu(cell, touch.clientX, touch.clientY);
            }
        }, this.LONG_PRESS_DURATION);
    }
    
    handleTouchMove(e) {
        if (!this.longPressTimer || this.preventDrag) return;

        e.preventDefault(); // Add this line
    
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - this.touchStartX);
        const deltaY = Math.abs(touch.clientY - this.touchStartY);
    
        // Clear long-press timer on any movement
        if (deltaX > 0 || deltaY > 0) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    
        // Check if movement exceeds drag threshold
        if (deltaX > this.DRAG_THRESHOLD || deltaY > this.DRAG_THRESHOLD) {
            e.preventDefault(); // Prevent scrolling when drag starts
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            this.isDrag = true;
    
            const cell = e.target.closest('.character-cell');
            if (cell) {
                this.handleDragStart({
                    target: cell,
                    preventDefault: () => { },
                    dataTransfer: { setData: () => { } }
                });
            }
        }
    }

    handleTouchEnd(e) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;

        if (this.isDrag) {
            // Complete the drag operation
            this.handleDragEnd(e);
            this.isDrag = false;
        }
    }

    setupControlButtons() {
        // Clean existing listeners first
        this.removeControlListeners();

        // Control Buttons
        this.deleteBtn = document.getElementById('deleteMode');
        this.deleteBtn.addEventListener('click', () => this.toggleDeleteMode());

        document.getElementById('exportBtn').addEventListener('click', () => this.exportToFile());

        document.getElementById('addCharacter').addEventListener('click', () => {
            sidebarManager.toggleSidebar();
        });

        // document.getElementById('share').addEventListener('click', () => this.shareGrid());

        // Check marks
        this.grid.addEventListener('click', this.handleToggleBound);
        this.setupContextMenu();
        
        document.getElementById('randomOperator').addEventListener('click', () => {this.showRandomOperator()});
    }

    setupContextMenu() {
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

        ['save', 'addCharacter', 'deleteMode', 'exportBtn'].forEach(cloneElement);
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
        else {
            this.showError("Import failed: ", response.error);
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
        // console.log("handle over");

        e.preventDefault();
        if (!this.dragSrcElement) return;

        const afterElement = this.getDragAfterElement(e.clientX, e.clientY);

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
        // console.log("handle end");

        this.dragSrcElement?.classList.remove('dragging');
        this.dragSrcElement = null;

        // Get new visual order from DOM
        const newVisualOrder = [...this.grid.children].map(cell => cell.dataset.id);
        /// ??? curious cell -> item

        // Map visual order changes to true state
        this.updateTrueStateLayout(newVisualOrder);

        // Update view state to match
        // this.viewState.layout = newVisualOrder;

        this.saveState();
    }

    updateTrueStateLayout(visualOrder) {
        const visualSet = new Set(visualOrder);
        let visualPointer = 0;

        this.trueState.layout = this.trueState.layout.map(id =>
            visualSet.has(id) ? visualOrder[visualPointer++] : id
        );
    }

    calcOffset(box, x, y) {
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;

        // Calculate distance from mouse to element center
        const offsetX = x - centerX;
        const offsetY = y - centerY;
        return { offsetX, offsetY };
    }

    getDragAfterElement(x, y) {
        const draggableElements = [...this.grid.querySelectorAll('.character-cell:not(.dragging)')];

        // Sort elements by their visual position (top -> bottom, left -> right)
        const sortedElements = draggableElements.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            return aRect.top - bRect.top || aRect.left - bRect.left;
        });

        const closest_row = sortedElements.reduce((closest, child) => {
            const { offsetX, offsetY } = this.calcOffset(child.getBoundingClientRect(), x, y);
            const distance = Math.sqrt(offsetX ** 2 + offsetY ** 2);

            const better_Y = (Math.abs(offsetY) == Math.abs(closest.offsetY)) ? (offsetY <= closest.offsetY) : (Math.abs(offsetY) <= Math.abs(closest.offsetY));
            if (better_Y) {
                return {
                    distance: distance,
                    element: child,
                    offsetX: offsetX,
                    offsetY: offsetY
                };
            }
            return closest;
        }, { distance: Infinity, element: null, offsetX: Infinity, offsetY: Infinity });

        if (closest_row.offsetY > closest_row.element.getBoundingClientRect().height / 2) {
            return sortedElements[-1];
        }

        return sortedElements.reduce((closest, child) => {
            const { offsetX, offsetY } = this.calcOffset(child.getBoundingClientRect(), x, y);
            const distance = Math.sqrt(offsetX ** 2 + offsetY ** 2);

            if (offsetY == closest.offsetY && distance < closest.distance) { // Check if closer than previous closest
                return {
                    distance: distance,
                    element: child,
                    offsetX: offsetX,
                    offsetY: offsetY
                };
            }
            return closest;
        }, closest_row).element;
    }

    logState() {
        console.log('GridManager state:', this.trueState);
    }

    async loadCharacters() {
        this.loadingState.characters = true;
        try {
            const response = await fetch('/api/characters');
            const { characters } = await response.json();
            this.characters = characters;
            this.characterMap = new Map(this.characters.map(c => [c.id, c]));
            this.originalFiles = this.characters.map(c => ({
                metadata: { // Match admin page structure
                    id: c.id,
                    class: c.class,
                    rarity: c.rarity,
                    name: c.name
                }
            }));
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

        // Get current skin or default
        const currentSkin = this.trueState.skins[character.id] || character.skins.default;

        cell.innerHTML = `
            <img src="/characters/${currentSkin}" class="character-image">
            <div class="check-mark" style="display: none;"></div>
            <div class="circles">
                ${[0, 0, 0].map(() => `<div class="circle"></div>`).join('')}
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
            this.grid.removeEventListener('click', this.handleToggleBound);
            this.grid.addEventListener('click', this.handleDeleteBound);
        } else {
            this.grid.removeEventListener('click', this.handleDeleteBound);
            this.grid.addEventListener('click', this.handleToggleBound);
        }
    }

    handleDelete(e) {
        const cell = e.target.closest('.character-cell');
        if (cell) {
            cell.remove();

            const index = this.trueState.layout.indexOf(cell.dataset.id);
            if (index !== -1) {
                this.trueState.layout.splice(index, 1);
                delete this.trueState.marks[cell.dataset.id];
            }

            this.saveState();
        }
    }

    handleToggle(e) {
        const cell = e.target.closest('.character-cell');
        if (cell) this.toggleCheckMark(cell);
    }

    addCharacterById(charId) {
        const character = this.characters.find(c => c.id === charId);
        if (character && !this.trueState.layout.some(l => l === character.id)) {
            const cell = this.createCharacterCell(character);
            this.grid.appendChild(cell);
            this.trueState.layout.push(character.id);
            this.trueState.marks[character.id] = { checks: false, marks: 0 };
            this.saveState();
        }
    }

    toggleCheckMark(cell) {
        const checkMark = cell.querySelector('.check-mark');
        checkMark.style.display = checkMark.style.display === 'none' ? 'block' : 'none';
        this.trueState.marks[cell.dataset.id].checks = !(checkMark.style.display === 'none');
        this.saveState();
    }

    showContextMenu(cell, x, y) {
        if (this.preventDrag) {
            // Allow native scrolling when context menu is active
            return;
        }

        // Remove existing menus
        document.querySelectorAll('.context-menu').forEach(menu => menu.remove());

        const menu = document.createElement('div');

        // Keep selection prevention but allow touch events
        menu.onselectstart = () => false;
        menu.className = 'context-menu';

        menu.innerHTML = `
            <div class="context-item" onclick="gridManager.addCircle('${cell.dataset.id}')">Add Circle</div>
            <div class="context-item" onclick="gridManager.removeCircle('${cell.dataset.id}')">Remove Circle</div>
        `;

        // Add skin selector if available
        const character = this.characterMap.get(cell.dataset.id);
        // if (character.skins.alternates.length > 0) {
        if (true) {
            menu.innerHTML += `
                <div class="context-item" onclick="gridManager.showSkinPopup('${cell.dataset.id}', ${x}, ${y})">
                    Change Skin
                </div>
            `;
        }

        // Temporarily add to DOM to measure
        menu.style.visibility = 'hidden';
        document.body.appendChild(menu);
    
        // Get menu dimensions
        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;
    
        // Calculate adjusted position
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const safetyMargin = 8;
    
        // Horizontal adjustment
        let finalX = x;
        if (x + menuWidth > viewportWidth) {
            finalX = Math.max(safetyMargin, x - menuWidth);
        }
    
        // Vertical adjustment
        let finalY = y;
        if (y + menuHeight > viewportHeight) {
            finalY = Math.max(safetyMargin, y - menuHeight);
        }
    
        // Apply calculated position
        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
        menu.style.visibility = 'visible';

        // Close menu on click outside
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        });
    }

    // New method for skin popup
    async showSkinPopup(charId, x, y) {
        const character = this.characterMap.get(charId);
        const popup = document.createElement('div');
        popup.className = 'skin-popup';
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;

        const skins = [character.skins.default, ...character.skins.alternates];

        popup.innerHTML = `
            <div class="skin-options">
            ${skins.map(skin => `
                <img src="/characters/${skin}" 
                    class="skin-option ${this.trueState.skins[charId] === skin ? 'selected' : ''}"
                    onclick="gridManager.selectSkin('${charId}', '${skin}')">
            `).join('')}
            </div>
        `;

        document.body.appendChild(popup);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', () => popup.remove(), { once: true });
        });
    }

    selectSkin(charId, skin) {
        const character = this.characterMap.get(charId);

        // Only store non-default skins
        if (skin === character.skins.default) {
            delete this.trueState.skins[charId];
        } else {
            this.trueState.skins[charId] = skin;
        }

        // Update visible image
        const img = this.grid.querySelector(`[data-id="${charId}"] .character-image`);
        if (img) img.src = `/characters/${skin}`;

        this.saveState();
    }

    // Add a circle (increase the count)
    addCircle(charId) {
        const circles = Array.from(this.grid.querySelector(`[data-id="${charId}"] .circles`).children);
        for (let circle of circles) {
            if (!circle.classList.contains('show')) {
                circle.classList.add('show');
                break;
            }
        }
        this.trueState.marks[charId].circles = circles.filter(circle => circle.classList.contains('show')).length;
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

        this.trueState.marks[charId].circles = circles.filter(circle => circle.classList.contains('show')).length;
        this.saveState();
    }

    showRandomOperator() {
        // Remove existing popup first
        const existingPopup = document.querySelector('.random-popup');
        if (existingPopup) {
            existingPopup.classList.add('fading-out');
            setTimeout(() => existingPopup.remove(), 300);
        }

        // Get currently visible operators
        const availableOperators = this.filteredFiles.filter(file => this.trueState.layout.includes(file.metadata.id));
        
        if (availableOperators.length === 0) {
            this.showError('No operators available in current view');
            return;
        }

        // Pick random operator
        const randomIndex = Math.floor(Math.random() * availableOperators.length);
        const operator = availableOperators[randomIndex];
        const character = this.characterMap.get(operator.metadata.id);

        // Create popup
        const popup = document.createElement('div');
        popup.className = 'random-popup';
        popup.innerHTML = `
            <button class="close-popup">&times;</button>
            <img src="/characters/${character.skins.default}" 
                 alt="${character.name}" 
                 class="random-operator-image">
            <p class="operator-name">${character.name}</p>
        `;

        // Add close functionality
        popup.querySelector('.close-popup').addEventListener('click', () => popup.remove());
        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.remove();
        });

        document.body.appendChild(popup);

    // Create popup with fade-in class
    popup.classList.add('fading-in');
    
    // Update auto-close to handle animation
    this.randomPopupTimeout = setTimeout(() => {
        if (document.body.contains(popup)) {
            popup.classList.add('fading-out');
            setTimeout(() => popup.remove(), 300);
        }
    }, 5000);
    }

    async loadProfile() {
        if (!this.isLoggedIn)
            throw new Error("Shouldn't have called loadProfile while not logged in!");

        this.loadingState.profile = true;

        try {
            const response = await fetch('/api/profile', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            this.trueState = await response.json();
            this.filterManager.applyFilters();
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
            this.trueState = {
                layout: state.layout || [],
                marks: state.marks || {},
                skins: state.skins || {}
            };
            this.filterManager.applyFilters();

            // console.log("state applied");
            // this.logState();
        }
        else {
            console.error("Empty state.")
        }

    }

    // Add this method to satisfy FilterManager requirements
    renderFiles(files) {
        // console.log("render files", files)
        this.filteredFiles = files;
        this.applyLayout();
    }

    applyLayout() {
        // Filter layout based on current filteredFiles
        const filteredIds = new Set(this.filteredFiles.map(f => f.metadata.id));
        const filteredLayout = this.trueState.layout.filter(id => filteredIds.has(id));

        // console.log('layout', this.trueState.layout);
        // console.log('filtered files', this.filteredFiles);
        // console.log('filtered layout', filteredLayout);

        // Add visual placeholders first
        this.grid.innerHTML = filteredLayout
            .map(() => `<div class="cell-placeholder"></div>`)
            .join('');

        // Then populate with actual data
        requestAnimationFrame(() => {
            this.grid.innerHTML = '';
            this.cellCache = new Map(); // Track created cells
            filteredLayout.forEach(charId => {
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
        Object.entries(this.trueState.marks).forEach(([id, marks]) => {
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

        // Apply skins
        Object.entries(this.trueState.skins).forEach(([id, skin]) => {
            const img = this.grid.querySelector(`[data-id="${id}"] .character-image`);
            if (img) img.src = `/characters/${skin}`;
        });
    }

    getCurrentState() {
        return {
            layout: this.trueState.layout,
            marks: this.trueState.marks,
            skins: this.trueState.skins
        };
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
        // console.log('save to server')

        if (this.isSharedPage && !this.isPersistentShare) {
            await this.saveSnapshotToServer(state);
            return;
        }

        const c_userId = (this.isSharedPage) ? this.shareId : this.userId;
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
        const state = this.getCurrentState();

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
        const state = this.getCurrentState();
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
        await window.gridManager.initializeAuth(); // Critical auth check
        await window.gridManager.initialize();

    } catch (error) {
        console.error('Initialization error:', error);
        window.gridManager.showError('Failed to load data');
    }
    window.sidebarManager = new SidebarManager(window.gridManager);
});