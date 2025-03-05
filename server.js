require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');

const app = express();
const upload = multer({ 
    dest: 'public/characters/temp/',
    limits: { fileSize: 500000 } // 500KB
});

// Configuration
const DATA_PATH = path.join(__dirname, 'public/data');
const CHAR_DATA_FILE = path.join(DATA_PATH, 'characters.json');
const SHARED_DIR = path.join(DATA_PATH, 'shared');

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Ensure directories exist
async function init() {
    await fs.mkdir(DATA_PATH, { recursive: true });
    await fs.mkdir(SHARED_DIR, { recursive: true });
    if (!await fileExists(CHAR_DATA_FILE)) {
        await fs.writeFile(CHAR_DATA_FILE, JSON.stringify({ characters: [] }));
    }
}

// API Endpoints

// Get all characters
app.get('/api/characters', async (req, res) => {
    try {
        const data = await fs.readFile(CHAR_DATA_FILE);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).send('Error loading characters');
    }
});

// Save user state
app.post('/api/save', async (req, res) => {
    const state = req.body;
    res.cookie('userState', JSON.stringify(state), { maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.sendStatus(200);
});

// Share state
app.post('/api/share', async (req, res) => {
    const shareId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const filePath = path.join(SHARED_DIR, `${shareId}.json`);
    await fs.writeFile(filePath, JSON.stringify(req.body));
    res.json({ shareId });
});

// Load shared state
app.get('/api/share/:id', async (req, res) => {
    try {
        const filePath = path.join(SHARED_DIR, `${req.params.id}.json`);
        const data = await fs.readFile(filePath);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).send('Shared state not found');
    }
});

// Admin endpoints
app.post('/admin/add', upload.single('image'), async (req, res) => {
    if (req.headers.authorization !== process.env.ADMIN_TOKEN) {
        return res.status(403).send('Unauthorized');
    }

    const { name, class: charClass, rarity } = req.body;
    const newChar = {
        id: `char_${Date.now()}`,
        name,
        class: charClass,
        rarity,
        image: `${req.file.filename}.png`
    };

    // Move and rename uploaded file
    const finalPath = path.join(__dirname, 'public/characters', newChar.image);
    await fs.rename(req.file.path, finalPath);

    // Update metadata
    const data = JSON.parse(await fs.readFile(CHAR_DATA_FILE));
    data.characters.push(newChar);
    await fs.writeFile(CHAR_DATA_FILE, JSON.stringify(data));

    res.json(newChar);
});

// Start server
init().then(() => {
    app.listen(3000, () => {
        console.log('Server running on http://localhost:3000');
        console.log(`Admin token: ${process.env.ADMIN_TOKEN}`);
    });
});

// Helper functions
async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}