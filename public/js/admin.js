class AdminManager {
  constructor() {
      // Verify admin access
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('token') !== process.env.ADMIN_TOKEN) {
          window.location = '/'; // Redirect if unauthorized
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
                      'Authorization': process.env.ADMIN_TOKEN
                  },
                  body: formData
              });
              
              if (response.ok) {
                  alert('Character added successfully!');
                  this.form.reset();
              } else {
                  alert('Error adding character');
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