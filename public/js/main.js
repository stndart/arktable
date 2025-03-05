class GridManager {
  constructor() {
      this.grid = document.getElementById('characterGrid');
      this.state = {
          layout: [],
          marks: {}
      };
      
      // Get control buttons
      this.saveBtn = document.getElementById('save');
      this.addBtn = document.getElementById('addCharacter');
      this.deleteBtn = document.getElementById('deleteMode');
      this.loadDefaultBtn = document.getElementById('loadDefault');

      this.init();
  }

  async init() {
      await this.loadDefaultProfile();
      await this.loadCharacters();
      this.loadState();
      this.setupEventListeners();
  }

  async loadDefaultProfile() {
      try {
          // Clear existing grid
          this.grid.innerHTML = '';

          // Load data
          const [profileRes, charsRes] = await Promise.all([
            fetch('/data/profiles/profile_table.json'),
            fetch('/api/characters')
          ]);
        
          const profile = await profileRes.json();
          const { characters } = await charsRes.json();
        
          // Create ID map for quick lookup
          const characterMap = new Map(characters.map(c => [c.id, c]));
          
          // Add unique characters in order
          const uniqueIDs = [...new Set(profile.layout)];
          uniqueIDs.forEach(charId => {
              if (characterMap.has(charId)) {
                  const cell = this.createCharacterCell(characterMap.get(charId));
                  this.grid.appendChild(cell);
              }
          });

          // Apply marks
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
          this.renderGrid();
      } catch (error) {
          console.error('Error loading characters:', error);
      }
  }

  createCharacterCell(character) {
      const cell = document.createElement('div');
      cell.className = 'character-cell';
      cell.dataset.id = character.id;
      cell.draggable = true;

      cell.innerHTML = `
          <div class="check-mark"></div>
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
      
      // Set temporary click handler
      if (isActive) {
          this.grid.addEventListener('click', this.handleDelete.bind(this), { once: true });
      }
  }

  handleDelete(e) {
      const cell = e.target.closest('.character-cell');
      if (cell) {
          cell.remove();
          this.saveState();
      }
      this.toggleDeleteMode(); // Reset mode
  }

  renderGrid() {
      this.grid.innerHTML = '';
      this.characters.forEach(character => {
          const cell = this.createCharacterCell(character);
          this.grid.appendChild(cell);
      });
  }

  setupEventListeners() {
      // Control Buttons
      this.saveBtn.addEventListener('click', () => this.saveState());
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
      // Simple implementation - add random character
      const newChar = {
          id: `char_${Date.now()}`,
          name: "New Character",
          image: "default.png"
      };
      
      const cell = this.createCharacterCell(newChar);
      this.grid.appendChild(cell);
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

  addCircle(charId) {
      const circles = this.grid.querySelector(`[data-id="${charId}"] .circles`).children;
      for (let circle of circles) {
          if (circle.style.display === 'none') {
              circle.style.display = 'block';
              break;
          }
      }
      this.saveState();
  }

  removeCircle(charId) {
      const circles = [...this.grid.querySelector(`[data-id="${charId}"] .circles`).children].reverse();
      for (let circle of circles) {
          if (circle.style.display === 'block') {
              circle.style.display = 'none';
              break;
          }
      }
      this.saveState();
  }

  loadState() {
      const cookieState = document.cookie.match(/userState=([^;]+)/);
      if (cookieState) {
          this.state = JSON.parse(decodeURIComponent(cookieState[1]));
          this.applyState();
      }
  }

  applyState() {
      // Apply check marks and circles
      Object.entries(this.state.marks).forEach(([id, marks]) => {
          const cell = this.grid.querySelector(`[data-id="${id}"]`);
          if (cell) {
              cell.querySelector('.check-mark').style.display = marks.checks ? 'block' : 'none';
              cell.querySelectorAll('.circle').forEach((circle, i) => {
                  circle.style.display = i < marks.circles ? 'block' : 'none';
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
              circles: [...cell.querySelectorAll('.circle')].filter(c => c.style.display === 'block').length
          };
      });

      // Save to cookie and server
      await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
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