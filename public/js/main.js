class GridManager {
  constructor() {
      this.grid = document.getElementById('characterGrid');
      this.state = {
          layout: [],
          marks: {}
      };
      
      this.init();
  }

  async init() {
      await this.loadCharacters();
      this.loadState();
      this.setupEventListeners();
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

  renderGrid() {
      this.grid.innerHTML = '';
      this.characters.forEach(character => {
          const cell = this.createCharacterCell(character);
          this.grid.appendChild(cell);
      });
  }

  createCharacterCell(character) {
      const cell = document.createElement('div');
      cell.className = 'character-cell';
      cell.draggable = true;
      cell.dataset.id = character.id;
      
      cell.innerHTML = `
          <div class="check-mark">✓</div>
          <img src="/characters/${character.image}" class="character-image">
          <div class="circles">
              <div class="circle"></div>
              <div class="circle"></div>
              <div class="circle"></div>
          </div>
      `;

      return cell;
  }

  setupEventListeners() {
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