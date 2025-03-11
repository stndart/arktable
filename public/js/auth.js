class AuthManager {
    constructor() {
        this.modal = document.getElementById('authModal');
        this.loginBtn = document.getElementById('loginBtn');
        this.registerBtn = document.getElementById('registerBtn');
        this.userInfo = document.getElementById('userInfo');
        this.userEmail = document.getElementById('userEmail');
        this.logoutBtn = document.getElementById('logoutBtn');

        this.initEventListeners();
        this.checkAuthState();
    }

    initEventListeners() {
        // Show auth modal
        this.loginBtn.addEventListener('click', () => {
          this.modal.style.display = 'block';
          this.switchTab('login');
        });
    
        this.registerBtn.addEventListener('click', () => {
          this.modal.style.display = 'block';
          this.switchTab('register');
        });
    
        // Logout
        this.logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('jwt');
          window.location.reload();
        });
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', e => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', e => this.handleRegister(e));

        // Close modal
        document.querySelector('.close').addEventListener('click', () => this.hide());
    }

    checkAuthState() {
        const token = localStorage.getItem('jwt');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            this.showUserInfo(payload.email);
        }
    }

    showUserInfo(email) {
        this.userEmail.textContent = email;
        this.userInfo.style.display = 'block';
        this.loginBtn.style.display = 'none';
        this.registerBtn.style.display = 'none';
    }

    switchTab(tabName) {
        document.querySelectorAll('.auth-form, .tab').forEach(el => {
            el.classList.toggle('active', el.id === `${tabName}Form` || el.dataset.tab === tabName);
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        const [email, password] = e.target.elements;
        await this.authenticate('/api/login', email.value, password.value);
    }

    async handleRegister(e) {
        e.preventDefault();
        const [email, password] = e.target.elements;
        await this.authenticate('/api/register', email.value, password.value);
    }

    async authenticate(endpoint, email, password) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) throw new Error('Authentication failed');

            const { token } = await response.json();
            localStorage.setItem('jwt', token);
            window.location.reload(); // Refresh to update auth state

        } catch (error) {
            this.showStatus(error.message, 'error');
        }
    }

    show() { this.modal.style.display = 'block'; }
    hide() { this.modal.style.display = 'none'; }
    showStatus(message, type) { /* ... */ }
}

// Initialize when DOM loaded
document.addEventListener('DOMContentLoaded', () => new AuthManager());