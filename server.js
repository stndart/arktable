require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { Console } = require('console');
const crypto = require('crypto');

const app = express();
const upload = multer({ 
    dest: 'public/characters/temp/',
    limits: { fileSize: 500000 } // 500KB
});

// Configuration
const DATA_PATH = path.join(__dirname, 'public/data');
const CHAR_DATA_FILE = path.join(DATA_PATH, 'characters.json');
const SHARED_DIR = path.join(DATA_PATH, 'shared');

app.get('/share/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

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
    
    // Create default profile if missing
    const PROFILE_FILE = path.join(DATA_PATH, 'profiles/default.json');
    if (!await fileExists(PROFILE_FILE)) {
        await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });
        await fs.writeFile(PROFILE_FILE, JSON.stringify({
            layout: ["wizadel", "schwarz"],
            marks: {
                "wizadel": { checks: true, circles: 2 },
                "schwarz": { checks: false, circles: 0 }
            }
        }));
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
        Console.log(error);
    }
});

// Save user state
app.post('/api/save', async (req, res) => {
    const state = req.body;
    res.cookie('userState', JSON.stringify(state), { maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.sendStatus(200);
});

app.post('/api/share', async (req, res) => {
    const { state, mode } = req.body;
    const shareId = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(SHARED_DIR, `${shareId}.json`);
    
    await fs.writeFile(filePath, JSON.stringify({
        state,
        mode: mode || 'readwrite',
        created: new Date().toISOString()
    }));
    
    res.json({ 
        shareId,
        readwriteLink: `${process.env.BASE_URL}/share/${shareId}?edit=true`,
        readonlyLink: `${process.env.BASE_URL}/share/${shareId}`
    });
});

app.get('/api/share/:id', async (req, res) => {
    try {
        const filePath = path.join(SHARED_DIR, `${req.params.id}.json`);
        const data = await fs.readFile(filePath);
        const sharedState = JSON.parse(data);
        res.json(sharedState);
    } catch (error) {
        res.status(404).send('Shared link not found');
        console.log("404: Share link not found");
    }
});

app.post('/api/export', async (req, res) => {
    const state = req.body;
    const fileName = `grid-profile-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(state));
});

// Admin endpoints
app.post('/admin/add', upload.single('image'), async (req, res) => {
    console.log("admin add");
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== process.env.ADMIN_TOKEN) {
        console.log("unauthorized")
        return res.status(403).send('Unauthorized');
    }

    const { name, class: charClass, subclass: charSubclass, rarity } = req.body;
    const id = name.toLowerCase().replace(/[^a-z]/g, '');
    const filename = `${id}.png`;

    // Read existing data
    const data = JSON.parse(await fs.readFile(CHAR_DATA_FILE));

    // Check for duplicate id
    if (data.characters.some(c => c.id === id)) {
        return res.status(400).json({ error: 'Character with this name already exists' });
    }

    const newChar = {
        id,
        name,
        class: charClass,
        subclass: charSubclass,
        rarity,
        image: filename
    };

    // Move and rename uploaded file
    const finalPath = path.join(__dirname, 'public/characters', newChar.image);
    await fs.rename(req.file.path, finalPath);

    console.log(req.file.path);
    console.log(finalPath);

    // Add new character and update metadata
    data.characters.push(newChar);
    await fs.writeFile(CHAR_DATA_FILE, JSON.stringify(data, null, 4));
    
    console.log(CHAR_DATA_FILE);
    console.log(JSON.stringify(data));
    
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