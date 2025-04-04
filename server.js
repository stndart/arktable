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
    dest: 'uploads/',
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
            },
            skins: {}
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
        // Sort charData by id before sending
        const sortedCharacters = charData.characters.sort((a, b) => a.id.localeCompare(b.id));
        res.json({ characters: sortedCharacters });
    } catch (error) {
        res.status(500).send('Error loading characters');
        console.log(error);
    }
});

// Get available skins
app.get('/api/character/:id/skins', async (req, res) => {
    const character = charData.characters.find(c => c.id === req.params.id);

    res.json({
        default: character?.skins.default,
        alternates: character?.skins.alternates || []
    });
});

app.post('/api/import', async (req, res) => {
    try {
        const { layout, marks, skins } = req.body;

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

        // Validate skins structure
        const allSkinIdsValid = skins.every(id => validCharIds.has(id));
        if (!allSkinIdsValid) {
            return res.status(400).json({ error: 'Some skins character IDs do not exist' });
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

    // Check for duplicate id
    if (charData.characters.some(c => c.id === id)) {
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
    await renameFile(req.file.path, finalPath, basefile = false);

    console.log(req.file.path);
    console.log(finalPath);

    // Add new character and update metadata
    charData.characters.push(newChar);
    await saveCharacters(charData);

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

            const stats = await fs.stat(path.join(CHARACTERS_DIR, file));
            let existing = charData.characters.find(c => c.skins?.default === file);
            if (!existing)
                existing = charData.characters.find(c => c.skins?.alternates?.includes(file));

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

async function changeID(characters, originalFile, id) {
    const oldChar = characters.find(c =>
        c.skins.default === originalFile ||
        c.skins.alternates.includes(originalFile)
    );

    if (!oldChar) {
        return { error: "Original file not found" };
    }
    // Move all skins to new ID and collect errors
    let success = true;
    const errors = [];
    const newSkins = {
        default: '',
        alternates: []
    };

    try {
        // Rename default skin first
        const newDefaultName = `${id}.png`;
        await renameFile(oldChar.skins.default, newDefaultName);
        newSkins.default = newDefaultName;

        // Process alternate skins with sequential numbering
        for (let i = 0; i < oldChar.skins.alternates.length; i++) {
            const altSkin = oldChar.skins.alternates[i];
            const newName = `${id}_skin${i + 1}.png`;
            await renameFile(altSkin, newName);
            newSkins.alternates.push(newName);
        }
    } catch (err) {
        success = false;
        errors.push(`Failed to rename skins: ${err.message}`);
    }

    // Prepare new character entry with updated filenames
    const newChar = {
        ...oldChar,
        id,
        skins: newSkins,
        meta: {
            ...oldChar.meta,
            modified: new Date().toISOString()
        }
    };

    console.log('Starting ID change for:', oldChar.id, 'to', id);
    if (success) {
        // Remove old character and add the new one only on success
        characters = characters.filter(c => c.id !== oldChar.id);
        characters.push(newChar);
        console.log('ID changed successfully to:', id);
        await saveCharacters({ characters: characters });
    } else {
        console.error('Error during ID change:', errors.join('\n'));
        return { error: errors.join('\n') };
    }

    return { success: success };

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
    let success = true;
    let error;
    try {
        await renameFile(originalFile, `${id}.png`);
    } catch (err) {
        success = false;
        error = err;
    }

    if (success) {
        characters.push(newChar);
        await saveCharacters({ characters: characters });
    } else {
        return { error: error };
    }
    return { success: success };
}

async function addSkin(characters, idExists, originalFile, id, name, charClass, charSubclass, rarity) {
    // Validate fields match
    // disabled since fields can be empty
    // if (
    //     // idExists.id !== id || // is always false
    //     idExists.name !== name ||
    //     idExists.class !== charClass ||
    //     idExists.subclass !== charSubclass ||
    //     idExists.rarity !== rarity
    // ) {
    //     return { error: "Field mismatch for skin addition" };
    // }

    let usedNumbers = [];
    for (const alt of idExists.skins.alternates) {
        const match = alt.match(/_skin(\d+)\.png$/);
        if (match) {
            usedNumbers.push(parseInt(match[1], 10));
        }
    }

    let nextNumber = 1;
    while (usedNumbers.includes(nextNumber)) {
        nextNumber++;
    }

    const newFilename = `${id}_skin${nextNumber}.png`;
    
    // Rename the file and handle errors
    let success = true;
    let error;
    try {
        await renameFile(originalFile, newFilename);
    } catch (err) {
        success = false;
        error = err;
    }

    if (success) {
        idExists.skins.alternates.push(newFilename); // Use the new filename
        idExists.meta.modified = new Date().toISOString();
        await saveCharacters({ characters: characters });
    } else {
        console.log(`Failed to rename skin file from ${originalFile} to ${newFilename}: ${error.message}`);
        return { error: `Failed to rename skin file: ${error.message}` };
    }

    return { success: true, newFilename: newFilename };
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
    saveCharacters({ characters: characters });
    return { success: true };
}

async function rename_internal(originalFile, newFilename) {
    // fs.rename(originalFile, newFilename); // missing permissions error
    try {
        await fs.copyFile(originalFile, newFilename);
        await fs.unlink(originalFile);
    } catch (error) {
        console.log(`Failed to rename file from ${originalFile} to ${newFilename}`);
        return;
    }
    console.log(`File renamed from ${originalFile} to ${newFilename}`);
}

async function renameFile(originalFile, newFilename, basefile = true) {
    if (basefile) {
        await rename_internal(
            path.join(CHARACTERS_DIR, originalFile),
            path.join(CHARACTERS_DIR, newFilename)
        );
    } else {
        await rename_internal(originalFile, newFilename);
    }
}

async function saveCharacters(characters) {
    await fs.truncate(CHAR_DATA_FILE, 0);
    await fs.writeFile(CHAR_DATA_FILE, JSON.stringify(characters, null, 2));
    reload_chars();
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
        const characters = charData.characters;
        // character with given file (undefined if file is unindexed)
        const fileExists = characters.find(c =>
            c.skins.default === originalFile ||
            c.skins.alternates.includes(originalFile)
        );
        // character with given id (id is undefined when unindexed, hence idExists is undefined when unindexed)
        const idExists = characters.find(c => c.id === id);

        let status = { success: false };
        let newFilename = "";
        // Case d: Change ID
        if (fileExists && !idExists) {
            // if (originalFile && idExists && idExists.id !== originalFile.replace('.png', '')) { /// TODO: bugged?
            status = await changeID(characters, originalFile, id);
            console.log(`Changed id of ${originalFile} to ${id}`);
        }
        // Case a: Add new entry
        if (!fileExists && !idExists) {
            status = await addChar(characters, originalFile, id, name, charClass, charSubclass, rarity);
            newFilename = `${id}.png`;
            console.log(`Added new char ${originalFile} with id ${id}`);
        }
        // Case c: Add skin
        if (!fileExists && idExists) {
            const { newstatus, newFilename } = await addSkin(characters, idExists, originalFile, id, name, charClass, charSubclass, rarity);
            status = newstatus;
            console.log(`Added new skin ${newFilename} for char id ${id}`);
        }
        // Case b: Update record
        if (fileExists && idExists) {
            if (fileExists.id !== idExists.id) { // attempt to change id (case d)
                console.log("New id already exists");
                status = { error: "New id already exists" };
            } else {
                status = await updateChar(characters, id, name, charClass, charSubclass, rarity);
                console.log(`Updated char entry for char id ${id}`);
            }
        }

        if ('error' in status) {
            console.log("update file failed:", status);
            res.status(400).json(status);
        }
        else {
            res.json({ success: true, newFilename });
        }
    } catch (error) {
        console.log("Error updating file", error);
        res.status(500).json({ error: 'File update failed' });
    }
});

// Upload skin endpoint
app.post('/admin/upload-skin', adminAuth, upload.single('skin'), async (req, res) => {
    const { characterId } = req.body;

    try {
        const character = charData.characters.find(c => c.id === characterId);

        if (!character) {
            return res.status(404).json({ error: "Character not found" });
        }

        // Move uploaded file to characters directory
        const ext = path.extname(req.file.originalname);

        const newFilename = `${characterId}_skin${character.skins.alternates.length + 1}${ext}`;
        await renameFile(
            req.file.path,
            path.join(CHARACTERS_DIR, newFilename),
            basename = false
        );

        // Update character record
        character.skins.alternates.push(newFilename);
        character.meta.modified = new Date().toISOString();

        await saveCharacters(charData);

        res.json({
            success: true,
            filename: newFilename
        });

    } catch (error) {
        console.error('Skin upload failed:', error);
        res.status(500).json({ error: "Skin upload failed" });
    }
});

// Set default skin endpoint
app.post('/admin/set-default-skin', adminAuth, async (req, res) => {
    const { characterId, filename } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    try {
        const character = charData.characters.find(c => c.id === characterId);

        if (!character) {
            return res.status(404).json({ error: "Character not found" });
        }

        // Validate skin exists
        if (character.skins.default !== filename &&
            !character.skins.alternates.includes(filename)) {
            return res.status(400).json({ error: "Invalid skin file" });
        }

        // Swap default and previous default
        const oldDefault = character.skins.default;
        character.skins.alternates = character.skins.alternates.filter(f => f !== filename);
        character.skins.alternates.push(oldDefault);
        character.skins.default = filename;
        character.meta.modified = new Date().toISOString();

        await saveCharacters(charData);

        res.json({ success: true });

    } catch (error) {
        console.error('Set default failed:', error);
        res.status(500).json({ error: "Set default failed" });
    }
});

// Delete file
app.delete('/admin/delete-file', adminAuth, async (req, res) => {
    const { filename } = req.body;

    try {
        // First update metadata
        let charactersUpdated = false;

        // Find all characters using this file
        const affectedCharacters = charData.characters.filter(c =>
            c.skins.default === filename ||
            c.skins.alternates.includes(filename)
        );

        for (const char of affectedCharacters) {
            if (char.skins.default === filename) {
                // Handle default skin deletion
                if (char.skins.alternates.length > 0) {
                    // Promote first alternate to default
                    char.skins.default = char.skins.alternates.shift();
                    char.meta.modified = new Date().toISOString();
                } else {
                    // Delete character if no alternates left
                    charData.characters = charData.characters.filter(c => c.id !== char.id);
                }
                charactersUpdated = true;
            } else {
                // Remove from alternates
                const index = char.skins.alternates.indexOf(filename);
                if (index > -1) {
                    char.skins.alternates.splice(index, 1);
                    char.meta.modified = new Date().toISOString();
                    charactersUpdated = true;
                }
            }
        }

        // Delete physical file
        const filePath = path.join(CHARACTERS_DIR, filename);
        try {
            await fs.access(filePath, fs.constants.F_OK);
            await fs.unlink(filePath);
        } catch (fileError) {
            if (fileError.code !== 'ENOENT') {
                throw fileError;
            }
        }

        if (charactersUpdated) {
            await saveCharacters(charData);
        }

        res.json({
            success: true,
            message: affectedCharacters.length ?
                'File deleted and metadata updated' :
                'Orphan file deleted'
        });

    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            error: 'File deletion failed',
            details: error.message
        });
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
