class SidebarManager {
    constructor(gridManager) {
        this.gridManager = gridManager;
        this.sidebar = document.getElementById('sidebarContainer');
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidebar-overlay';
        document.body.appendChild(this.overlay);
        
        this.initEventListeners();
        this.loadCharacters();
    }

    initEventListeners() {
        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterCharacters(e.target.value.toLowerCase());
        });

        // Overlay click
        this.overlay.addEventListener('click', () => this.toggleSidebar(false));
    }

    async loadCharacters() {
        try {
            const response = await fetch('/api/characters');
            const { characters } = await response.json();
            this.allCharacters = characters;
            this.displayCharacters(characters);
        } catch (error) {
            console.error('Failed to load characters:', error);
        }
    }

    displayCharacters(characters) {
        const container = document.getElementById('sidebarGrid');
        container.innerHTML = characters.map(char => `
            <div class="sidebar-character" data-id="${char.id}">
                <img src="/characters/${char.image}" alt="${char.name}" title="${char.name}">
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.sidebar-character').forEach(el => {
            el.addEventListener('click', () => {
                this.gridManager.addCharacterById(el.dataset.id);
            });
        });
    }

    filterCharacters(query) {
        const filtered = this.allCharacters.filter(char => 
            char.id.toLowerCase().includes(query) ||
            char.name.toLowerCase().includes(query)
        );
        this.displayCharacters(filtered);
    }

    toggleSidebar(forceState) {
        const isActive = typeof forceState === 'boolean' ? forceState : !this.sidebar.classList.contains('active');
        this.sidebar.classList.toggle('active', isActive);
        this.overlay.classList.toggle('active', isActive);
    }
}