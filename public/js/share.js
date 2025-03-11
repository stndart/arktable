class ShareManager {
    constructor(gridManager) {
        this.gridManager = gridManager;
        this.shareId = window.location.pathname.split('/share/')[1]?.split('/')[0];
        this.init();
    }

    async init() {
        if (!this.shareId) return;

        document.getElementById('sharedHeader').style.display = 'block';
        await this.loadSharedState();
        this.setupUiMode();
    }

    async loadSharedState() {
        try {
            const response = await fetch(`/api/share/${this.shareId}`);
            if (!response.ok) throw new Error('Invalid share link');

            const { state, mode } = await response.json();
            await this.gridManager.loadState(state);

            const editMode = new URLSearchParams(window.location.search).has('edit');
            this.isEditable = mode === 'readwrite' && editMode;

            document.getElementById('shareModeInfo').textContent =
                `${this.isEditable ? 'Editable' : 'Read-Only'} • Shared ${new Date().toISOString().split('T')[0]}`;

        } catch (error) {
            alert('Invalid or expired share link');
            window.location = '/';
        }
    }

    setupUiMode() {
        // Show controls if editable
        ['addCharacter', 'deleteMode', 'loadDefault'].forEach(id => {
            document.getElementById(id).style.display = this.isEditable ? '' : 'none';
        });

        document.getElementById('save').style.display = 'none';

        // Enable editing features
        if (this.isEditable) {
            this.gridManager.enableEditMode();
            this.gridManager.setDraggable(true);
        }
    }
    showShareDialog() {
        const isPersistent = gridManager.isLoggedIn;
        const url = gridManager.getShareLink();

        this.dialog.innerHTML = `
        <h3>Share Your Grid</h3>
        <div class="share-type ${isPersistent ? 'persistent' : 'snapshot'}">
          ${isPersistent ?
                'Permanent Link' :
                'Snapshot Link (Expires in 7 days)'}
        </div>
        <input type="text" value="${url}" readonly>
        <button onclick="navigator.clipboard.writeText('${url}')">
            Copy Link
        </button>
        ${isPersistent ? `
          <div class="notice">
            This link will always show your latest saved grid
          </div>
        ` : ''}
      `;
    }
}