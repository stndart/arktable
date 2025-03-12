class MessageManager {
    constructor() {
        this.container = document.getElementById('messageContainer');
        this.messageQueue = [];
        this.isProcessing = false;
    }

    showMessage(type, text, duration = 5000) {
        const message = this.createMessage(type, text);
        this.messageQueue.push({ message, duration });

        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    createMessage(type, text) {
        const message = document.createElement('div');
        message.className = `alert ${type}`;
        message.textContent = text;
        message.setAttribute('role', 'alert');
        return message;
    }

    processQueue() {
        if (this.messageQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { message, duration } = this.messageQueue.shift();

        this.container.appendChild(message);

        // Auto-remove after duration
        setTimeout(() => {
            message.classList.add('fade-out');
            setTimeout(() => {
                message.remove();
                this.processQueue();
            }, 300);
        }, duration);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize once per page
    window.messageManager = new MessageManager();
});

// Example usage:
// messageManager.showMessage('success', 'Changes saved successfully!');
// messageManager.showMessage('error', 'Failed to save data');