class MessageManager {
    constructor() {
        this.container = document.getElementById('messageContainer');
    }

    showMessage(type, text, duration = 3000) {
        const message = this.createMessage(type, text);
        // Append message immediately so they stack vertically
        this.container.appendChild(message);
        
        // After the duration, start fade-out animation, then remove element
        setTimeout(() => {
            message.classList.add('fade-out');
            // Wait for the fade-out transition (300ms) before removing the element
            setTimeout(() => {
                message.remove();
            }, 300);
        }, duration);
    }

    createMessage(type, text) {
        const message = document.createElement('div');
        message.className = `alert ${type}`;
        message.textContent = text;
        message.setAttribute('role', 'alert');
        return message;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize once per page
    window.messageManager = new MessageManager();
});

// Example usage:
// messageManager.showMessage('success', 'Changes saved successfully!');
// messageManager.showMessage('error', 'Failed to save data');