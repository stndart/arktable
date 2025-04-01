require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { Console } = require('console');
const crypto = require('crypto');
const chokidar = require('chokidar');

const createHash = crypto.createHash;
const jwt = require('jsonwebtoken');
const { userInfo } = require('os');
const uuidv4 = require('uuid').v4;

const app = express();

// Configuration
const DATA_PATH = path.join(__dirname, '/data');
const SHARED_DIR = path.join(DATA_PATH, 'shared');
const PROFILE_DIR = path.join(DATA_PATH, 'profiles');

const PUBLIC_DATA_PATH = path.join(__dirname, 'data/common')
const CHARACTERS_DIR = path.join(__dirname, 'data/characters');
const SUBCLASSES_FILE = path.join(PUBLIC_DATA_PATH, 'classes.json');
const CHAR_DATA_FILE = path.join(PUBLIC_DATA_PATH, 'characters.json');
let charData = require(CHAR_DATA_FILE);
let validCharIds = new Set(charData.characters?.map(char => char.id));

const upload = multer({
    dest: path.join(CHARACTERS_DIR, 'temp/'),
    limits: { fileSize: 500000 } // 500KB
});

const watcher = chokidar.watch(CHAR_DATA_FILE, {
    persistent: true,
    ignoreInitial: true
});

let timeout;
watcher.on('change', () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        console.log("Detected char data file change");
        reload_chars();
    }, 500); // Adjust delay if needed
});

function reload_chars() {
    // console.log("Reloaded chars");
    delete require.cache[require.resolve(CHAR_DATA_FILE)];
    charData = require(CHAR_DATA_FILE);
    validCharIds = new Set(charData.characters?.map(char => char.id));
}


const USERS_FILE = path.join(DATA_PATH, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET;

const DEFAULT_PROFILE_PATH = path.join('data/profiles/default.json');

if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET not defined!');
    process.exit(1);
}

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use('/default_profile', express.static(DEFAULT_PROFILE_PATH));
app.use('/characters', express.static(CHARACTERS_DIR));

// User storage helper
async function getUsers() {
    return JSON.parse(await fs.readFile(USERS_FILE, 'utf8') || '[]');
}

async function saveUser(user) {
    const users = await getUsers();
    users.push(user);
    await fs.truncate(USERS_FILE, 0);
    await fs.writeFile(USERS_FILE, JSON.stringify(users));
    const profile_path = path.join(PROFILE_DIR, `${user.id}.json`);
    await fs.copyFile(DEFAULT_PROFILE_PATH, profile_path);

    console.log(`Registered user: email ${user.email}`);
}

const adminAuth = (req, res, next) => {
    // Check both URL parameter and Authorization header
    const tokenParam = req.query.token;
    const authHeader = req.headers.authorization;

    const validToken = process.env.ADMIN_TOKEN;
    const token = tokenParam || (authHeader && authHeader.split(' ')[1]);

    if (token === validToken) {
        next();
    } else {
        res.status(403).json({ error: 'Invalid admin token' });
    }
};

const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Verify user exists
        const users = await getUsers();
        const user = users.find(u => u.id === decoded.userId);

        if (!user) {
            res.status(401).json({ error: 'Unauthorized' });
            console.log("User not found:", user);
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
        console.log("Unauthorized:", error);
    }
};

// Ensure directories exist
async function init() {
    await fs.mkdir(DATA_PATH, { recursive: true });
    await fs.mkdir(SHARED_DIR, { recursive: true });
    if (!await fileExists(CHAR_DATA_FILE)) {
        await fs.truncate(CHAR_DATA_FILE, 0);
        await fs.writeFile(CHAR_DATA_FILE, JSON.stringify({ characters: [] }));
    }

    // Create default profile if missing
    const PROFILE_FILE = path.join(DATA_PATH, 'profiles/default.json');
    if (!await fileExists(PROFILE_FILE)) {
        await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });
        await fs.truncate(PROFILE_FILE, 0);
        await fs.writeFile(PROFILE_FILE, JSON.stringify({
            layout: ["wisadel", "schwarz"],
            marks: {
                "wisadel": { checks: true, circles: 2 },
                "schwarz": { checks: false, circles: 0 }
            }
        }));
    }
}

// API Endpoints

app.get('/api/subclasses', async (req, res) => {
    try {
        const data = await fs.readFile(SUBCLASSES_FILE);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to load subclasses' });
    }
});

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

app.post('/api/import', async (req, res) => {
    try {
        const { layout, marks } = req.body;

        // Validate layout structure
        if (!Array.isArray(layout)) {
            return res.status(400).json({ error: 'Invalid layout format' });
        }

        // Validate character IDs
        const validLayoutFormat = layout.every(id =>
            typeof id === 'string' &&
            /^[a-z0-9_-]+$/.test(id)
        );
        if (!validLayoutFormat) {
            return res.status(400).json({ error: 'Invalid character IDs' });
        }

        // Validate that every layout id exists in our character data
        // const validCharIds = getValidCharIds(); // now updated dynamically
        const allLayoutIdsValid = layout.every(id => validCharIds.has(id));
        if (!allLayoutIdsValid) {
            return res.status(400).json({ error: 'Some layout character IDs do not exist' });
        }

        // Validate marks structure
        if (!marks || typeof marks !== 'object' || Array.isArray(marks)) {
            return res.status(400).json({ error: 'Invalid marks format' });
        }

        // Validate each mark entry:
        // Each key should correspond to a valid character id,
        // and each value must be an object with a boolean "checks" and a number "circles" (0-3)
        for (const [id, mark] of Object.entries(marks)) {
            // Check if the mark's id exists in the character data
            if (!validCharIds.has(id)) {
                return res.status(400).json({ error: `Character ID "${id}" in marks does not exist` });
            }

            if (typeof mark !== 'object' || mark === null) {
                return res.status(400).json({ error: `Invalid mark entry for character "${id}"` });
            }

            if (typeof mark.checks !== 'boolean') {
                return res.status(400).json({ error: `Invalid "checks" value for character "${id}"` });
            }

            if (typeof mark.circles !== 'number' || mark.circles < 0 || mark.circles > 3) {
                return res.status(400).json({ error: `Invalid "circles" value for character "${id}"` });
            }
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Import failed' });
        console.error("Import error", error);
    }
});

// User endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = await getUsers();

        if (users.some(u => u.email === email)) {
            console.log("400: Email already exists");
            return res.status(400).json({ error: 'Email already exists' });
        }

        const user = {
            id: uuidv4(),
            email,
            password: createHash('sha256').update(password).digest('hex'),
            createdAt: new Date().toISOString()
        };

        await saveUser(user);

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });

    } catch (error) {
        console.error("Registration failed", error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    let wemail = "";
    try {
        const { email, password } = req.body;
        wemail = email;
        const users = await getUsers();
        const user = users.find(u => u.email === email);

        if (!user || user.password !== createHash('sha256').update(password).digest('hex')) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log(`Login to email ${wemail} successfull`);

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });

    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
        console.error(`Login to email ${wemail} failed`, error);
    }
});

app.get('/api/validate-token', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ valid: false });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(401).json({
                valid: false,
                error: err.name === 'TokenExpiredError'
                    ? 'Token expired'
                    : 'Invalid token'
            });
        }

        // check userId is valid
        const users = await getUsers();
        const userExists = users.some(user => user.id === decoded.userId);
        if (!userExists) {
            return res.status(401).json({
                valid: false,
                error: 'User not found'
            });
        }

        res.json({
            valid: true,
            userId: decoded.userId,
            email: decoded.email
        });
    });
});

app.get('/api/profile', auth, async (req, res) => {
    try {
        const profilePath = path.join(PROFILE_DIR, `${req.user.id}.json`);
        const data = await fs.readFile(profilePath);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).json({ error: 'Profile not found' });
        console.log("Profile not found", error);
    }
});

// app.post('/api/save', auth, async (req, res) => {
app.post('/api/save', async (req, res) => { // security disabled for now
    try {
        const { state, userId } = req.body;
        const profilePath = path.join(PROFILE_DIR, `${userId}.json`);
        await fs.truncate(profilePath, 0);
        // console.log(JSON.stringify(state));
        await fs.writeFile(profilePath, JSON.stringify(state));
        res.json({ success: true });

    } catch (error) {
        res.status(500).json({ error: 'Save failed' });
        console.log('Save failed', error);
    }
});

// Save shared snapshot
app.post('/api/save-shared', async (req, res) => {
    try {
        const { state, snapshotId } = req.body;
        const shareId = snapshotId ? snapshotId : uuidv4();
        const filePath = path.join(SHARED_DIR, `${shareId}.json`);

        await fs.truncate(filePath, 0);
        await fs.writeFile(filePath, JSON.stringify(state));
        res.json({ shareId });

    } catch (error) {
        res.status(500).json({ error: 'Shared save failed' });
        console.log('Shared save failed', error);
    }
});

app.post('/api/share', async (req, res) => {
    const shareId = uuidv4();
    const filePath = path.join(SHARED_DIR, `${shareId}.json`);
    try {
        await fs.truncate(filePath, 0);
    } catch { }
    await fs.writeFile(filePath, JSON.stringify({
        ...req.body,
        meta: {
            created: new Date().toISOString(),
            parent: req.query.edit ? req.params.id : null
        }
    }));

    res.json({ shareId });
});

app.get('/api/shared/:id', async (req, res) => {
    // Existing anonymous snapshot
    try {
        const filePath = path.join(SHARED_DIR, `${req.params.id}.json`);
        const data = await fs.readFile(filePath);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).send('Shared state not found');
    }
});

app.get('/api/shared/user/:userId', async (req, res) => {
    // New persistent profile share
    try {
        const profilePath = path.join(PROFILE_DIR, `${req.params.userId}.json`);
        const data = await fs.readFile(profilePath);
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(404).json({ error: 'User profile not found' });
    }
});

app.get('/shared/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/shared/user/:userId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Admin endpoints
app.post('/admin/add', upload.single('image'), async (req, res) => {
    console.log("admin add");
    const token = req.headers.authorization?.split(' ')[1];
    if (token !== process.env.ADMIN_TOKEN) {
        console.log("unauthorized")
        return res.status(403).send('Unauthorized');
    }

    const { charId, name, class: charClass, subclass: charSubclass, rarity } = req.body;
    const id = (charId) ? charId : name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '_');
    const filename = `${id}.png`;

    // Read existing data
    const data = await loadCharacters();
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
    const finalPath = path.join(CHARACTERS_DIR, newChar.image);
    await fs.rename(req.file.path, finalPath);

    console.log(req.file.path);
    console.log(finalPath);

    // Add new character and update metadata
    data.characters.push(newChar);
    await fs.truncate(CHAR_DATA_FILE, 0);
    await fs.writeFile(CHAR_DATA_FILE, JSON.stringify(data, null, 4));
    reload_chars();

    console.log(CHAR_DATA_FILE);
    console.log(JSON.stringify(data));

    res.json(newChar);
});

app.post('/admin/remove-index', adminAuth, async (req, res) => {
    const { filename } = req.body;

    try {
        const data = require(CHAR_DATA_FILE);

        // Toggle existence in metadata
        const index = data.characters.findIndex(c => c.image === filename);
        if (index > -1) {
            data.characters.splice(index, 1);
        } else {
            // Add minimal metadata (user can fill details later)
            data.characters.push({
                id: filename.replace('.png', ''),
                name: 'New Character',
                class: 'Guard',
                subclass: '',
                rarity: '4',
                image: filename
            });
        }

        await fs.truncate(metaPath, 0);
        await fs.writeFile(metaPath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Index toggle failed' });
    }
});

// Get all character files with metadata status
app.get('/admin/files', adminAuth, async (req, res) => {
    try {
        const files = await fs.readdir(CHARACTERS_DIR);

        const fileData = await Promise.all(files.map(async (file) => {
            if (!file.endsWith('.png')) return null;

            // console.log(metadata);
            // console.log(charData.characters);

            const stats = await fs.stat(path.join(CHARACTERS_DIR, file));
            const existing = charData.characters.find(c => c.image === file);

            return {
                filename: file,
                indexed: !!existing,
                size: stats.size,
                created: stats.birthtime,
                metadata: existing
            };
        }));

        res.json(fileData.filter(Boolean));
    } catch (error) {
        res.status(500).json({ error: 'File scan failed' });
        console.error("File scan error", error);
    }
});

async function loadCharacters() {
    return JSON.parse(await fs.readFile(CHAR_DATA_FILE)).characters;
}

async function changeID(characters, originalFile, id) {
    const oldChar = characters.find(c =>
        c.skins.default === originalFile ||
        c.skins.alternates.includes(originalFile)
    );

    if (!oldChar) {
        return { error: "Original file not found" };
    }

    // Move all skins to new ID
    const newChar = {
        ...oldChar,
        id,
        skins: oldChar.skins,
        meta: {
            ...oldChar.meta,
            modified: new Date().toISOString()
        }
    };

    // Remove old character
    characters = characters.filter(c => c.id !== oldChar.id);
    characters.push(newChar);

    // Rename files
    await renameFile(oldChar.skins.default, `${id}.png`);
    await Promise.all(oldChar.skins.alternates.map(async (skin, index) => {
        await renameFile(skin, `${id}_skin${index + 1}.png`);
    }));

    return { success: true };
}

async function addChar(characters, originalFile, id, name, charClass, charSubclass, rarity) {
    const newChar = {
        id,
        name,
        class: charClass,
        subclass: charSubclass,
        rarity,
        skins: {
            default: `${id}.png`,
            alternates: []
        },
        meta: {
            created: new Date().toISOString(),
            modified: new Date().toISOString()
        }
    };
    await renameFile(originalFile, `${id}.png`);
    characters.push(newChar);
    return { success: true };
}

async function addSkin(characters, idExists, originalFile, id, name, charClass, charSubclass, rarity) {
    // Validate fields match
    if (
        // idExists.id !== id || // is always false
        idExists.name !== name ||
        idExists.class !== charClass ||
        idExists.subclass !== charSubclass ||
        idExists.rarity !== rarity
    ) {
        return { error: "Field mismatch for skin addition" };
    }

    idExists.skins.alternates.push(originalFile);
    idExists.meta.modified = new Date().toISOString();
    return { success: true };
}

async function updateChar(characters, id, name, charClass, charSubclass, rarity) {
    const charIndex = characters.findIndex(c => c.id === id);
    characters[charIndex] = {
        ...characters[charIndex],
        name: name || characters[charIndex].name,
        class: charClass || characters[charIndex].class,
        subclass: charSubclass || characters[charIndex].subclass,
        rarity: rarity || characters[charIndex].rarity,
        meta: {
            ...characters[charIndex].meta,
            modified: new Date().toISOString()
        }
    };
    return { success: true };
}

// Update metadata and rename file
app.post('/admin/update-file', adminAuth, async (req, res) => {
    const { originalFile, id, name, class: charClass, subclass: charSubclass, rarity } = req.body;

    try {
        // Validate ID format
        if (!/^[_a-z0-9\-]+$/.test(id)) {
            console.log("Error updating file: bad id", id);
            return res.status(400).json({ error: 'ID must be lowercase alphanumeric' });
        }

        // Read existing data
        const characters = await loadCharacters();
        const fileExists = characters.some(c =>
            c.skins.default === originalFile ||
            c.skins.alternates.includes(originalFile)
        );
        const idExists = characters.find(c => c.id === id);

        let status = { success: false };
        let newFilename;
        // Case d: Change ID
        if (fileExists && !idExists) {
            // if (originalFile && idExists && idExists.id !== originalFile.replace('.png', '')) { /// TODO: bugged?
            status = await changeID(characters, originalFile, id);
            console.log("Changing id of {} to {}", originalFile, id)
        }
        // Case a: Add new entry
        if (!fileExists && !idExists) {
            status = await addChar(characters, originalFile, id, name, charClass, charSubclass, rarity);
            newFilename = `${id}.png`;
            console.log("Added new char {} with id {}", originalFile, id);
        }
        // Case c: Add skin
        if (!fileExists && idExists) {
            status = await addSkin(characters, idExists, originalFile, id, name, charClass, charSubclass, rarity);
            newFilename = originalFile;
            console.log("Added new skin {} for char id {}", originalFile, id);
        }
        // Case b: Update record
        if (fileExists && idExists) {
            if (fileExists.id !== idExists.id) {
                console.log("New id already exists");
                status = { error: "New id already exists" };
            }
            status = await updateChar(characters, id, name, charClass, charSubclass, rarity);
            console.log("Updated char entry for char id {}", id);
        }

        if ('error' in status) {
            res.status(400).json(status);
        }
        else {
            await fs.truncate(CHAR_DATA_FILE, 0);
            await fs.writeFile(CHAR_DATA_FILE, JSON.stringify({ characters: characters }, null, 2));
            reload_chars();
            res.json({ success: true, newFilename });
        }
    } catch (error) {
        console.log("Error updating file", error);
        res.status(500).json({ error: 'File update failed' });
    }
});

// Delete file
app.delete('/admin/delete-file', adminAuth, async (req, res) => {
    const { filename } = req.body;

    try {
        const filePath = path.join(CHARACTERS_DIR, filename);
        await fs.unlink(filePath);

        // Remove from metadata
        const data = require(CHAR_DATA_FILE);
        data.characters = data.characters.filter(c => c.image !== filename);
        await fs.truncate(CHAR_DATA_FILE, 0);
        await fs.writeFile(CHAR_DATA_FILE, JSON.stringify(data, null, 2));

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'File deletion failed' });
    }
});

// Start server
init().then(() => {
    app.listen(process.env.PORT, () => {
        console.log(`Server running on ${process.env.BASE_URL}`);
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
