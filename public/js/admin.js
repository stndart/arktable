class AdminManager {
    constructor() {
        // Verify admin access
        // Get token from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.adminToken = urlParams.get('token');
        
        // Validate token presence
        if (!this.adminToken) {
            window.location.href = '/';
            return;
        }

        this.form = document.getElementById('adminForm');
        this.initEventListeners();
    }

    initEventListeners() {
        this.form.addEventListener('submit', async e => {
            e.preventDefault();
            const formData = new FormData(this.form);
            
            try {
                const response = await fetch('/admin/add', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`
                    },
                    body: formData
                });

                console.log(response);
                
                if (response.ok) {
                    alert('Character added successfully!');
                    this.form.reset();
                } else {
                    if (response.status === 403) {
                        alert('Unauthorized! You do not have permission to add characters.');
                    } else if (response.status === 400) {
                        alert('Duplicate character! A character with this name already exists.');
                    } else {
                        alert('Error adding character.');
                    }
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Failed to add character');
            }
        });
    }
}

// Initialize admin manager
new AdminManager();