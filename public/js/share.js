class ShareManager {
    constructor(gridManager) {
        this.gridManager = gridManager;
        this.modal = document.getElementById('shareModal');
        this.optionsContainer = document.querySelector('.share-options');
        this.linkPreview = document.getElementById('shareLinkPreview');

        // this.init();
        this.initEventListeners();
    }

    async init() {
        if (!this.gridManager.isSharedPage) return;

        document.getElementById('sharedHeader').style.display = 'block';
        this.setupUi();
    }

    initEventListeners() {
        // Close modal
        document.querySelector('.close-btn').addEventListener('click', () => this.hide());

        // Close when clicking outside
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide();
        });

        if (this.gridManager.isSharedPage)
            this.setupUi();
    }

    show() {
        this.modal.style.display = 'flex';
        this.populateOptions();
    }

    hide() {
        this.modal.style.display = 'none';
    }

    populateOptions() {
        this.optionsContainer.innerHTML = '';

        const options = (this.gridManager.isLoggedIn || (this.gridManager.isSharedPage && this.gridManager.isEditable))? [
            { icon: '🔗', label: 'Create readonly snapshot', method: 'shareReadOnlySnapshot' },
            { icon: '✏️', label: 'Create editable snapshot', method: 'shareEditableSnapshot' },
            { icon: '🔗', label: 'Share the grid in readonly mode', method: 'sharePersistentReadOnly' },
            { icon: '✏️', label: 'Share the grid in editable mode', method: 'sharePersistentEditable' }
        ] : [
            { icon: '🔗', label: 'Create readonly snapshot', method: 'shareReadOnlySnapshot' },
            { icon: '✏️', label: 'Create editable snapshot', method: 'shareEditableSnapshot' }
        ];

        options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'share-option';
            div.innerHTML = `
                <span class="option-icon">${opt.icon}</span>
                <span>${opt.label}</span>
            `;
            div.addEventListener('click', () => this[opt.method]());
            this.optionsContainer.appendChild(div);
        });
    }

    shareReadOnlySnapshot() {
        console.log('Sharing read-only snapshot');
        const share_link = this.gridManager.shareSnapshot(this.gridManager.state, false);
        this.updateLinkPreview(share_link);
    }

    shareEditableSnapshot() {
        console.log('Sharing editable snapshot');
        const share_link = this.gridManager.shareSnapshot(this.gridManager.state, true);
        this.updateLinkPreview(share_link);
    }

    sharePersistentReadOnly() {
        console.log('Sharing persistent read-only');
        const share_link = this.gridManager.sharePersistent(false);
        this.updateLinkPreview(share_link);
    }

    sharePersistentEditable() {
        console.log('Sharing persistent editable');
        const share_link = this.gridManager.sharePersistent(true);
        this.updateLinkPreview(share_link);
    }

    async updateLinkPreview(link) {
        const link_url = await link;
        this.linkPreview.textContent = link_url;
        navigator.clipboard.writeText(link_url);
    }

    setupUi() {
        // Show share status
        document.getElementById('sharedHeader').style.display = 'block';
        document.getElementById('shareStatus').textContent =
            this.gridManager.isPersistentShare
                ? `Viewing shared grid`
                : 'Viewing shared snapshot';

        // Hide all controls except share button
        document.querySelectorAll('.controls button').forEach(btn => {
            btn.style.display = 'none';
        });
        document.querySelectorAll('.controls label').forEach(btn => {
            btn.style.display = 'none';
        });
        document.getElementById('share').style.display = 'block';
        document.getElementById('exportBtn').style.display = 'block';

        document.getElementById('shareModeInfo').textContent =
            `${this.gridManager.isEditable ? 'Editable' : 'Read-Only'} • Shared ${new Date().toISOString().split('T')[0]}`;


        // Show controls if editable
        ['addCharacter', 'deleteMode'].forEach(id => {
            document.getElementById(id).style.display = this.gridManager.isEditable ? '' : 'none';
        });

        // Enable editing features
        if (this.gridManager.isEditable) {
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