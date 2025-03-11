export const storage = {
    async save(userId, data) {
        if (userId) {
            // Server storage
            await fs.writeFile(`data/profiles/${userId}.json`, JSON.stringify(data));
        } else {
            // Local storage fallback
            localStorage.setItem('gridState', JSON.stringify(data));
        }
    },

    async load(userId) {
        if (userId) {
            return JSON.parse(await fs.readFile(`data/profiles/${userId}.json`));
        }
        return JSON.parse(localStorage.getItem('gridState') || '{}');
    }
};