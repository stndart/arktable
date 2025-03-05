class GridManager {
    constructor() {
      this.loadStateFromCookie();
      this.initDragDrop();
    }
  
    addCheckmark(characterId) {
      // Toggle checkmark logic
    }
  
    addCircle(characterId) {
      // Cycle through 0-3 circles
    }
  
    saveState() {
      document.cookie = `gridState=${JSON.stringify(this.state)}`;
    }
  }