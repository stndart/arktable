class GridManager {
    constructor() {
        this.grid = document.getElementById('characterGrid');
        this.state = {
            layout: [],
            marks: {}
        };
        this.characterMap = new Map();
        
        // Get control buttons
        this.saveBtn = document.getElementById('save');
        this.addBtn = document.getElementById('addCharacter');
        this.deleteBtn = document.getElementById('deleteMode');
        this.loadDefaultBtn = document.getElementById('loadDefault');

        this.init();
    }

    async init() {
        await this.loadCharacters();
        await this.loadDefaultProfile();
        this.loadState();
        this.setupEventListeners();
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
            this.grid.addEventListener('click', this.handleDelete.bind(this));
        } else {
            // Optionally, remove the event listener if turning off delete mode
            this.grid.removeEventListener('click', this.handleDelete.bind(this));
        }
    }
    
    handleDelete(e) {
        const cell = e.target.closest('.character-cell');
        if (cell) {
            cell.remove();
            this.saveState();
        }
    }

    setupEventListeners() {
        // Control Buttons
        this.saveBtn.addEventListener('click', () => this.saveStateToServer());
        this.addBtn.addEventListener('click', () => this.addNewCharacter());
        this.deleteBtn.addEventListener('click', () => this.toggleDeleteMode());
        this.loadDefaultBtn.addEventListener('click', () => this.loadDefaultProfile());
        
        // Check marks
        this.grid.addEventListener('click', e => {
            const cell = e.target.closest('.character-cell');
            if (cell) this.toggleCheckMark(cell);
        });

        // Right-click context menu
        this.grid.addEventListener('contextmenu', e => {
            e.preventDefault();
            const cell = e.target.closest('.character-cell');
            if (cell) this.showContextMenu(cell, e.clientX, e.clientY);
        });

        // Drag & Drop
        this.grid.addEventListener('dragstart', e => {
            e.target.classList.add('dragging');
            e.dataTransfer.setData('text/plain', e.target.dataset.id);
        });

        this.grid.addEventListener('dragover', e => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(e.clientY);
            const draggable = document.querySelector('.dragging');
            if (afterElement) {
                this.grid.insertBefore(draggable, afterElement);
            } else {
                this.grid.appendChild(draggable);
            }
        });

        this.grid.addEventListener('dragend', e => {
            e.target.classList.remove('dragging');
            this.saveState();
        });
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
            console.log(`attempt to add show while op is ${circle.style.opacity} and classlist is ${circle.classList}`);
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

    loadState() {
        console.log("Loading state from cookies.");
        // console.warn("Loading from cookies is disabled.");
        // return;

        const cookieState = document.cookie.match(/userState=([^;]+)/);
        if (cookieState) {
            this.state = JSON.parse(decodeURIComponent(cookieState[1]));
            this.applyLayout();
            this.applyState();
        }
        
        this.logState();
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
}

// Initialize grid manager
const gridManager = new GridManager();

// Add profile loading button handler
document.getElementById('loadDefault').addEventListener('click', async () => {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.textContent = 'Loading Default Profile...';
    document.body.appendChild(overlay);

    await gridManager.loadDefaultProfile();
    overlay.remove();
});