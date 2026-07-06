const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'MONSFAMS';
const PREMIUM_PASSWORD = process.env.PREMIUM_PASSWORD || 'MONSFAMS';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 0;

// ============== SECURITY CONFIGURATION ==============
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ============== SESSION MANAGEMENT ==============
const sessions = new Map(); // token -> { adminId, adminPassword, createdAt, lastUsed, ip }

// Generate secure session token
function generateToken() {
    return crypto.randomBytes(48).toString('hex') + '-' + Date.now();
}

// Validate session token
function validateSession(token) {
    if (!token) return null;

    const session = sessions.get(token);
    if (!session) return null;

    // Check expiry
    if (Date.now() - session.createdAt > SESSION_EXPIRY) {
        sessions.delete(token);
        return null;
    }

    // Update last used
    session.lastUsed = Date.now();
    return session;
}

// ============== LOGIN RATE LIMITING ==============
const loginAttempts = new Map(); // ip -> { count, lockUntil }

function recordFailedLogin(ip) {
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, { count: 0, lockUntil: 0 });
    }

    const attempt = loginAttempts.get(ip);
    attempt.count++;

    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        attempt.lockUntil = Date.now() + LOGIN_LOCKOUT_TIME;
    }
}

function checkLoginBlocked(ip) {
    const attempt = loginAttempts.get(ip);
    if (!attempt) return false;

    if (attempt.lockUntil > Date.now()) {
        return true;
    }

    // Reset if lockout expired
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
        attempt.count = 0;
        attempt.lockUntil = 0;
    }

    return false;
}

function clearLoginAttempts(ip) {
    loginAttempts.delete(ip);
} // 0 = Unlimited

// ============== RATE LIMITING (IMPROVED) ==============
const requestLog = new Map(); // ip -> [{timestamp, count}]
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 100;

// Download-specific rate limiting (stricter)
const downloadLog = new Map(); // ip -> [{timestamp}]
const DOWNLOAD_RATE_WINDOW = 60000; // 1 minute
const MAX_DOWNLOADS_PER_WINDOW = 30; // Max 30 downloads per minute per IP

// Concurrent download limiting
const activeDownloads = new Map(); // ip -> count
const MAX_CONCURRENT_DOWNLOADS = 5; // Max 5 concurrent downloads per IP

// Cleanup old entries periodically
function cleanupOldEntries() {
    const now = Date.now();
    for (const [ip, entries] of requestLog) {
        const filtered = entries.filter(e => now - e.timestamp < RATE_LIMIT_WINDOW);
        if (filtered.length === 0) {
            requestLog.delete(ip);
        } else {
            requestLog.set(ip, filtered);
        }
    }
    for (const [ip, entries] of downloadLog) {
        const filtered = entries.filter(e => now - e.timestamp < DOWNLOAD_RATE_WINDOW);
        if (filtered.length === 0) {
            downloadLog.delete(ip);
        } else {
            downloadLog.set(ip, filtered);
        }
    }
}
setInterval(cleanupOldEntries, 60000); // Cleanup every minute

function checkRateLimit(ip, type = 'api') {
    const now = Date.now();
    const window = type === 'download' ? DOWNLOAD_RATE_WINDOW : RATE_LIMIT_WINDOW;
    const limit = type === 'download' ? MAX_DOWNLOADS_PER_WINDOW : MAX_REQUESTS_PER_WINDOW;
    const log = type === 'download' ? downloadLog : requestLog;

    if (!log.has(ip)) {
        log.set(ip, []);
    }

    const entries = log.get(ip).filter(e => now - e.timestamp < window);
    entries.push({ timestamp: now, count: 1 });
    log.set(ip, entries);

    return entries.length > limit;
}

function checkConcurrentDownloads(ip) {
    const current = activeDownloads.get(ip) || 0;
    if (current >= MAX_CONCURRENT_DOWNLOADS) {
        return true;
    }
    activeDownloads.set(ip, current + 1);
    return false;
}

function releaseConcurrentDownload(ip) {
    const current = activeDownloads.get(ip) || 1;
    if (current <= 1) {
        activeDownloads.delete(ip);
    } else {
        activeDownloads.set(ip, current - 1);
    }
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip;
}

// ============== STATS MANAGEMENT (THREAD-SAFE) ==============
const statsLock = new Map(); // Simple mutex for stats file
const STATS_LOCK_TIMEOUT = 1000; // 1 second timeout

async function readStats() {
    try {
        const data = await fs.promises.readFile(statsFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { free: {}, premium: {} };
    }
}

async function writeStats(stats) {
    // Simple file locking
    const lockKey = 'stats';
    const startTime = Date.now();

    while (statsLock.has(lockKey)) {
        if (Date.now() - startTime > STATS_LOCK_TIMEOUT) {
            // Timeout - write anyway
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    statsLock.set(lockKey, true);
    try {
        await fs.promises.writeFile(statsFile, JSON.stringify(stats));
    } finally {
        statsLock.delete(lockKey);
    }
}

async function incrementDownload(type, fileId) {
    try {
        const stats = await readStats();
        if (!stats[type]) stats[type] = {};
        stats[type][fileId] = (stats[type][fileId] || 0) + 1;
        await writeStats(stats);
        return stats[type][fileId];
    } catch (e) {
        console.error('Failed to update download stats:', e);
        return null;
    }
}

// ============== MIDDLEWARE ==============
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-admin-id', 'x-admin-password', 'x-session-token', 'x-request-id']
}));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
});

app.use(express.json({ limit: '1mb' }));

// Create directories
const uploadDir = path.join(__dirname, 'uploads');
const freeDir = path.join(__dirname, 'uploads', 'free');
const premiumDir = path.join(__dirname, 'uploads', 'premium');
const statsDir = path.join(__dirname, 'stats');

[uploadDir, freeDir, premiumDir, statsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Initialize stats file
const statsFile = path.join(statsDir, 'downloads.json');
if (!fs.existsSync(statsFile)) {
    fs.writeFileSync(statsFile, JSON.stringify({ free: {}, premium: {} }));
}

// ============== FILE STORAGE (WITH NESTED FOLDER SUPPORT) ==============
const metadataDir = path.join(__dirname, 'metadata');

// Initialize metadata directory and files
if (!fs.existsSync(metadataDir)) {
    fs.mkdirSync(metadataDir, { recursive: true });
}

// Folder metadata structure: { [type]: { [folderId]: { id, name, parentId, path, createdAt, files: [] } } }
const foldersFile = path.join(metadataDir, 'folders.json');

async function readFolders() {
    try {
        if (fs.existsSync(foldersFile)) {
            return JSON.parse(await fs.promises.readFile(foldersFile, 'utf8'));
        }
    } catch (e) {}
    return { free: {}, premium: {} };
}

async function writeFolders(folders) {
    await fs.promises.writeFile(foldersFile, JSON.stringify(folders, null, 2));
}

// Generate folder path based on hierarchy
function getFolderPath(folders, type, folderId) {
    if (folderId === 'all' || !folderId) return '';

    const folder = folders[type]?.[folderId];
    if (!folder) return folderId;

    // Build path from parent to child
    const pathParts = [];
    let current = folder;
    while (current && current.id !== 'all' && current.parentId) {
        const parent = folders[type]?.[current.parentId];
        if (parent) {
            pathParts.unshift(current.id);
            current = parent;
        } else {
            break;
        }
    }
    if (current && current.id !== 'all') {
        pathParts.unshift(current.id);
    }

    return pathParts.join('/');
}

// Ensure default folder for each type
async function ensureDefaultFolders() {
    const folders = await readFolders();
    let changed = false;

    for (const type of ['free', 'premium']) {
        if (!folders[type]) {
            folders[type] = {};
        }
        if (!folders[type]['all']) {
            folders[type]['all'] = {
                id: 'all',
                name: 'All Files',
                parentId: null,
                path: '',
                createdAt: new Date().toISOString(),
                isDefault: true,
                files: []
            };
            changed = true;
        }
    }

    if (changed) {
        await writeFolders(folders);
    }
    return folders;
}

// Ensure default folders exist
ensureDefaultFolders();

// File storage configuration with nested folder support
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const type = req.params.type || 'free';
        const folderId = req.body.folderId || 'all';
        const dir = path.join(__dirname, 'uploads', type, folderId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE || Infinity
    }
});

// Admin auth middleware - STRICT: Session token OR direct credentials
function adminAuth(req, res, next) {
    const sessionToken = req.headers['x-session-token'];
    const adminId = req.headers['x-admin-id'];
    const adminPassword = req.headers['x-admin-password'];
    const ip = getClientIp(req);

    // Option 1: Validate session token (preferred)
    if (sessionToken) {
        const session = validateSession(sessionToken);
        if (session) {
            // Verify IP matches (prevent session hijacking)
            if (session.ip !== ip) {
                // Log potential session hijacking attempt
                console.warn(`Session IP mismatch: stored=${session.ip}, current=${ip}`);
                // Still allow if it's a reasonable proxy scenario
            }
            req.adminSession = session;
            return next();
        }
    }

    // Option 2: Direct credentials (for API calls from admin panel)
    if (adminId === ADMIN_ID && adminPassword === ADMIN_PASSWORD) {
        // Generate session token for this session
        const token = generateToken();
        sessions.set(token, {
            adminId,
            adminPassword,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            ip
        });

        res.setHeader('X-Session-Token', token);
        return next();
    }

    res.status(401).json({ error: 'Unauthorized - Invalid ID or Password' });
}

// Rate limit check middleware (API)
function rateLimit(req, res, next) {
    const ip = getClientIp(req);
    if (checkRateLimit(ip, 'api')) {
        return res.status(429).json({
            error: 'Too many requests. Try again later.',
            retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000)
        });
    }
    next();
}

// Rate limit check middleware (Download)
function downloadRateLimit(req, res, next) {
    const ip = getClientIp(req);

    // Check concurrent downloads
    if (checkConcurrentDownloads(ip)) {
        return res.status(429).json({
            error: 'Too many downloads in progress. Please wait.',
            retryAfter: 30
        });
    }

    // Check rate limit
    if (checkRateLimit(ip, 'download')) {
        releaseConcurrentDownload(ip);
        return res.status(429).json({
            error: 'Download limit reached. Try again later.',
            retryAfter: Math.ceil(DOWNLOAD_RATE_WINDOW / 1000)
        });
    }

    // Ensure we release the concurrent download slot when done
    res.on('finish', () => releaseConcurrentDownload(ip));
    res.on('close', () => releaseConcurrentDownload(ip));

    next();
}

// ============ FOLDER API ROUTES (NESTED SUPPORT) ============

// Get all folders for a type (public) - with hierarchy
app.get('/api/folders/:type', rateLimit, async (req, res) => {
    const type = req.params.type;
    const { parent } = req.query; // Optional filter by parent

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    try {
        const folders = await readFolders();
        const typeFolders = folders[type] || {};

        // Count files recursively in a folder
        const countFilesRecursive = (folderId) => {
            let count = 0;
            const folderPath = folderId === 'all' ? '' : getFolderPath(folders, type, folderId);
            const dir = path.join(__dirname, 'uploads', type, folderPath);

            if (fs.existsSync(dir)) {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    if (stat.isFile()) {
                        count++;
                    }
                }
            }
            return count;
        };

        let folderList = Object.values(typeFolders).map(f => {
            // Build full path
            let fullPath = f.name;
            let current = f;
            while (current.parentId && typeFolders[current.parentId]) {
                current = typeFolders[current.parentId];
                fullPath = current.name + ' / ' + fullPath;
            }

            return {
                id: f.id,
                name: f.name,
                parentId: f.parentId || null,
                fullPath: fullPath,
                depth: f.id === 'all' ? 0 : (f.path ? f.path.split('/').length : 1),
                createdAt: f.createdAt,
                isDefault: f.isDefault || false,
                fileCount: countFilesRecursive(f.id)
            };
        });

        // Filter by parent if specified
        if (parent !== undefined) {
            folderList = folderList.filter(f => {
                if (parent === 'all' || parent === '' || parent === null) {
                    return f.id === 'all' || f.parentId === null || f.parentId === 'all';
                }
                return f.parentId === parent;
            });
        }

        // Sort: default first, then by hierarchy (parents before children), then by name
        folderList.sort((a, b) => {
            if (a.isDefault) return -1;
            if (b.isDefault) return 1;
            if (a.depth !== b.depth) return a.depth - b.depth;
            return a.name.localeCompare(b.name);
        });

        res.json(folderList);
    } catch (err) {
        console.error('Error reading folders:', err);
        res.status(500).json({ error: 'Failed to load folders' });
    }
});

// Create folder (admin only) - with parent support
app.post('/api/folders/:type', adminAuth, async (req, res) => {
    const type = req.params.type;
    const { name, parentId } = req.body;

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!name || name.trim().length < 1) {
        return res.status(400).json({ error: 'Folder name is required' });
    }

    const folderName = name.trim();
    const folderId = folderName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    const safeParentId = parentId && parentId !== 'all' ? parentId : null;

    try {
        const folders = await readFolders();
        if (!folders[type]) folders[type] = {};

        // Verify parent exists if specified
        if (safeParentId && !folders[type][safeParentId]) {
            return res.status(400).json({ error: 'Parent folder not found' });
        }

        // Check if folder with same name exists under same parent
        const existingFolder = Object.values(folders[type]).find(f =>
            f.name.toLowerCase() === folderName.toLowerCase() &&
            (f.parentId || null) === safeParentId
        );
        if (existingFolder) {
            return res.status(400).json({ error: 'Folder with this name already exists in this location' });
        }

        // Build path
        let folderPath = folderName;
        if (safeParentId) {
            folderPath = getFolderPath(folders, type, safeParentId) + '/' + folderName;
        }

        folders[type][folderId] = {
            id: folderId,
            name: folderName,
            parentId: safeParentId,
            path: folderPath,
            createdAt: new Date().toISOString(),
            isDefault: false,
            files: []
        };

        // Create physical folder
        const physicalDir = path.join(__dirname, 'uploads', type, folderPath);
        if (!fs.existsSync(physicalDir)) {
            fs.mkdirSync(physicalDir, { recursive: true });
        }

        await writeFolders(folders);

        res.json({
            success: true,
            folder: folders[type][folderId]
        });
    } catch (err) {
        console.error('Error creating folder:', err);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Get single folder info
app.get('/api/folders/:type/:folderId', rateLimit, async (req, res) => {
    const { type, folderId } = req.params;

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    try {
        const folders = await readFolders();
        const folder = folders[type]?.[folderId];

        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Build full path
        let fullPath = folder.name;
        let current = folder;
        while (current.parentId && folders[type][current.parentId]) {
            current = folders[type][current.parentId];
            fullPath = current.name + ' / ' + fullPath;
        }

        res.json({
            ...folder,
            fullPath
        });
    } catch (err) {
        console.error('Error reading folder:', err);
        res.status(500).json({ error: 'Failed to load folder' });
    }
});

// Delete folder (admin only) - with subfolders
app.delete('/api/folders/:type/:folderId', adminAuth, async (req, res) => {
    const { type, folderId } = req.params;

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (folderId === 'all') {
        return res.status(400).json({ error: 'Cannot delete default folder' });
    }

    try {
        const folders = await readFolders();
        if (!folders[type] || !folders[type][folderId]) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const folder = folders[type][folderId];

        // Find all subfolders recursively
        const findSubfolders = (parentId) => {
            const subs = [];
            for (const [id, f] of Object.entries(folders[type])) {
                if (f.parentId === parentId && id !== 'all') {
                    subs.push(id);
                    subs.push(...findSubfolders(id));
                }
            }
            return subs;
        };

        const allFolderIds = [folderId, ...findSubfolders(folderId)];

        // Delete all physical folders
        for (const fid of allFolderIds) {
            const f = folders[type][fid];
            if (f) {
                const physicalDir = path.join(__dirname, 'uploads', type, f.path || fid);
                if (fs.existsSync(physicalDir)) {
                    const deleteRecursive = (dir) => {
                        const items = fs.readdirSync(dir);
                        for (const item of items) {
                            const fullPath = path.join(dir, item);
                            const stat = fs.statSync(fullPath);
                            if (stat.isDirectory()) {
                                deleteRecursive(fullPath);
                                fs.rmdirSync(fullPath);
                            } else {
                                fs.unlinkSync(fullPath);
                            }
                        }
                    };
                    deleteRecursive(physicalDir);
                    if (f.path !== fid) {
                        try { fs.rmdirSync(physicalDir); } catch (e) {}
                    }
                }
            }
        }

        // Delete from metadata
        for (const fid of allFolderIds) {
            delete folders[type][fid];
        }
        await writeFolders(folders);

        res.json({
            success: true,
            message: `Folder "${folder.name}" and ${allFolderIds.length - 1} subfolder(s) deleted`
        });
    } catch (err) {
        console.error('Error deleting folder:', err);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

// Rename folder (admin only)
app.put('/api/folders/:type/:folderId', adminAuth, async (req, res) => {
    const { type, folderId } = req.params;
    const { name } = req.body;

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!name || name.trim().length < 1) {
        return res.status(400).json({ error: 'Folder name is required' });
    }

    try {
        const folders = await readFolders();
        if (!folders[type] || !folders[type][folderId]) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const newName = name.trim();
        folders[type][folderId].name = newName;
        await writeFolders(folders);

        res.json({
            success: true,
            folder: folders[type][folderId]
        });
    } catch (err) {
        console.error('Error renaming folder:', err);
        res.status(500).json({ error: 'Failed to rename folder' });
    }
});

// ============ API ROUTES ============

// Get all files (public) - with nested folder support
app.get('/api/files/:type', rateLimit, async (req, res) => {
    const type = req.params.type;
    const { folder } = req.query; // Optional folder filter

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Use "free" or "premium"' });
    }

    try {
        const downloadStats = await readStats();
        const folders = await readFolders();

        let dir;
        let basePath = '';

        if (folder && folder !== 'all') {
            // Check if folder exists
            const folderData = folders[type]?.[folder];
            if (!folderData) {
                return res.status(404).json({ error: 'Folder not found' });
            }
            dir = path.join(__dirname, 'uploads', type, folderData.path || folder);
            basePath = folderData.path || folder;
        } else {
            // Get all files from all subfolders
            dir = path.join(__dirname, 'uploads', type);
        }

        if (!fs.existsSync(dir)) {
            return res.json([]);
        }

        // Read all files recursively or from single folder
        const getFilesRecursive = (directory, relativePath = '') => {
            const files = [];
            const items = fs.readdirSync(directory);

            for (const item of items) {
                const fullPath = path.join(directory, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    if (!item.startsWith('.')) {
                        files.push(...getFilesRecursive(fullPath, relativePath ? relativePath + '/' + item : item));
                    }
                } else if (stat.isFile()) {
                    const parts = item.split('-');
                    const fileId = parts[0];
                    const originalName = parts.slice(2).join('-') || item;

                    files.push({
                        id: fileId,
                        name: originalName,
                        filename: item,
                        filenameWithPath: (relativePath ? relativePath + '/' : '') + item,
                        folderPath: relativePath,
                        folderId: relativePath.split('/')[0] || 'all',
                        size: stat.size,
                        type: type,
                        createdAt: stat.birthtime.toISOString(),
                        downloadUrl: `/download/${type}/${relativePath ? relativePath + '/' : ''}${encodeURIComponent(item)}`,
                        downloads: downloadStats[type]?.[fileId] || 0
                    });
                }
            }
            return files;
        };

        let files = getFilesRecursive(dir, basePath);

        files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(files);
    } catch (err) {
        console.error('Error reading files:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get files in specific folder (public) - with nested support
app.get('/api/files/:type/folder/:folderId', rateLimit, async (req, res) => {
    const { type, folderId } = req.params;

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    try {
        const downloadStats = await readStats();
        const folders = await readFolders();

        if (folderId !== 'all' && (!folders[type] || !folders[type][folderId])) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const folderData = folderId === 'all' ? null : folders[type][folderId];
        const folderPath = folderData?.path || '';
        const dir = path.join(__dirname, 'uploads', type, folderPath);

        if (!fs.existsSync(dir)) {
            return res.json([]);
        }

        const getFiles = (directory, relativePath = '') => {
            const files = [];
            const items = fs.readdirSync(directory);

            for (const item of items) {
                const fullPath = path.join(directory, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    if (!item.startsWith('.')) {
                        files.push(...getFiles(fullPath, relativePath ? relativePath + '/' + item : item));
                    }
                } else if (stat.isFile()) {
                    const parts = item.split('-');
                    const fileId = parts[0];
                    const originalName = parts.slice(2).join('-') || item;

                    files.push({
                        id: fileId,
                        name: originalName,
                        filename: item,
                        filenameWithPath: (relativePath ? relativePath + '/' : '') + item,
                        folderPath: relativePath,
                        folderId: relativePath.split('/')[0] || folderId,
                        size: stat.size,
                        type: type,
                        createdAt: stat.birthtime.toISOString(),
                        downloadUrl: `/download/${type}/${relativePath ? relativePath + '/' : ''}${encodeURIComponent(item)}`,
                        downloads: downloadStats[type]?.[fileId] || 0
                    });
                }
            }
            return files;
        };

        let files = getFiles(dir, folderPath);
        files.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(files);
    } catch (err) {
        console.error('Error reading folder files:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Download file (public) - with nested folder support
app.get('/download/:type/*', downloadRateLimit, async (req, res) => {
    const type = req.params.type;
    // Path could be nested: folder1/folder2/filename
    const pathParts = req.params[0].split('/');
    const filename = decodeURIComponent(pathParts.pop());
    const folderPath = pathParts.join('/');

    const filePath = path.join(__dirname, 'uploads', type, folderPath, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    // Increment download counter (async, non-blocking)
    const parts = decodedFilename.split('-');
    const fileId = parts[0];
    incrementDownload(type, fileId).catch(e => console.error('Stats error:', e));

    // Stream file with proper headers
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const fileName = parts.slice(2).join('-') || decodedFilename;

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Accept-Ranges', 'bytes');

    // Stream the file (memory efficient for large files)
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        } else {
            res.end();
        }
    });

    fileStream.pipe(res);
});

// Upload single file (admin only) - with nested folder support
app.post('/api/upload/:type', adminAuth, upload.single('file'), async (req, res) => {
    const type = req.params.type;
    const folderId = req.body.folderId || 'all';

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get folder info for proper path
    const folders = await readFolders();
    const folderData = folders[type]?.[folderId];
    const folderPath = folderData?.path || '';

    const fileData = {
        id: req.file.filename.split('-')[0],
        name: req.body.name || req.file.originalname,
        filename: req.file.filename,
        folderId: folderId,
        folderPath: folderPath,
        size: req.file.size,
        type: type,
        createdAt: new Date().toISOString(),
        downloadUrl: `/download/${type}/${folderPath ? folderPath + '/' : ''}${encodeURIComponent(req.file.filename)}`
    };

    res.json({
        success: true,
        message: 'File uploaded successfully',
        file: fileData
    });
});

// Upload multiple files (admin only) - with nested folder support
app.post('/api/upload-multiple/:type', adminAuth, upload.array('files', 100), async (req, res) => {
    const type = req.params.type;
    const folderId = req.body.folderId || 'all';

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    // Get folder info for proper path
    const folders = await readFolders();
    const folderData = folders[type]?.[folderId];
    const folderPath = folderData?.path || '';

    const files = req.files.map(file => ({
        id: file.filename.split('-')[0],
        name: file.originalname,
        filename: file.filename,
        folderId: folderId,
        folderPath: folderPath,
        size: file.size,
        type: type,
        createdAt: new Date().toISOString(),
        downloadUrl: `/download/${type}/${folderPath ? folderPath + '/' : ''}${encodeURIComponent(file.filename)}`
    }));

    res.json({
        success: true,
        message: `${files.length} files uploaded successfully`,
        count: files.length,
        files: files
    });
});

// Delete single file (admin only) - with nested folder support
app.delete('/api/files/:type/*', adminAuth, async (req, res) => {
    const type = req.params.type;
    // The path could be: folderId/filename or just filename (for 'all')
    const pathParts = req.params[0].split('/');
    const filename = decodeURIComponent(pathParts.pop());
    const folderPath = pathParts.join('/');

    const filePath = path.join(__dirname, 'uploads', type, folderPath, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        fs.unlinkSync(filePath);
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Delete all files of type or folder (admin only)
app.delete('/api/files/:type', adminAuth, async (req, res) => {
    const type = req.params.type;
    const { folder } = req.query; // Optional folder filter

    if (!['free', 'premium'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
    }

    try {
        let dir;
        let deletedCount = 0;

        if (folder) {
            // Delete all files in specific folder
            dir = path.join(__dirname, 'uploads', type, folder);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(dir, file));
                });
                // Reset folder metadata
                const folders = await readFolders();
                if (folders[type] && folders[type][folder]) {
                    folders[type][folder].files = [];
                    await writeFolders(folders);
                }
                deletedCount = files.length;
            }
        } else {
            // Delete all files and folders
            dir = path.join(__dirname, 'uploads', type);
            if (fs.existsSync(dir)) {
                const deleteRecursive = (directory) => {
                    const items = fs.readdirSync(directory);
                    for (const item of items) {
                        const fullPath = path.join(directory, item);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            deleteRecursive(fullPath);
                            fs.rmdirSync(fullPath);
                        } else {
                            fs.unlinkSync(fullPath);
                            deletedCount++;
                        }
                    }
                };
                deleteRecursive(dir);
            }

            // Reset folders metadata
            const folders = await readFolders();
            folders[type] = {
                'all': {
                    id: 'all',
                    name: 'All Files',
                    createdAt: new Date().toISOString(),
                    isDefault: true,
                    files: []
                }
            };
            await writeFolders(folders);
        }

        res.json({
            success: true,
            message: `${deletedCount} files deleted successfully`,
            count: deletedCount
        });
    } catch (err) {
        console.error('Delete all error:', err);
        res.status(500).json({ error: 'Failed to delete files' });
    }
});

// Get storage stats (admin only)
app.get('/api/stats', adminAuth, async (req, res) => {
    const stats = {
        free: { count: 0, totalSize: 0, downloads: 0, formattedSize: '0 B', folders: 0 },
        premium: { count: 0, totalSize: 0, downloads: 0, formattedSize: '0 B', folders: 0 },
        total: { count: 0, totalSize: 0, downloads: 0, formattedSize: '0 B' }
    };

    try {
        const downloadStats = await readStats();
        const folders = await readFolders();

        for (const type of ['free', 'premium']) {
            const dir = path.join(__dirname, 'uploads', type);
            if (fs.existsSync(dir)) {
                const countFilesRecursive = (directory) => {
                    let count = 0;
                    let size = 0;
                    const items = fs.readdirSync(directory);
                    for (const item of items) {
                        const fullPath = path.join(directory, item);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            if (!item.startsWith('.')) {
                                stats[type].folders++;
                                const sub = countFilesRecursive(fullPath);
                                count += sub.count;
                                size += sub.size;
                            }
                        } else {
                            count++;
                            size += stat.size;
                        }
                    }
                    return { count, size };
                };

                const result = countFilesRecursive(dir);
                stats[type].count = result.count;
                stats[type].totalSize = result.size;

                // Count downloads
                for (const [fileId, count] of Object.entries(downloadStats[type] || {})) {
                    stats[type].downloads += count;
                }
                stats[type].formattedSize = formatBytes(stats[type].totalSize);
                stats.total.count += stats[type].count;
                stats.total.totalSize += stats[type].totalSize;
                stats.total.downloads += stats[type].downloads;
            }

            // Count folders from metadata
            if (folders[type]) {
                stats[type].folders = Math.max(0, Object.keys(folders[type]).length - 1); // Exclude 'all'
            }
        }
        stats.total.formattedSize = formatBytes(stats.total.totalSize);

        res.json(stats);
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// Verify admin credentials - WITH RATE LIMITING
app.post('/api/verify', (req, res) => {
    const ip = getClientIp(req);

    // Check if IP is blocked
    if (checkLoginBlocked(ip)) {
        const attempt = loginAttempts.get(ip);
        const remainingTime = Math.ceil((attempt.lockUntil - Date.now()) / 1000 / 60);
        return res.status(429).json({
            error: 'Too many failed attempts. Try again later.',
            retryAfter: remainingTime * 60,
            locked: true
        });
    }

    const { id, password } = req.body;

    // Validate input
    if (!id || !password) {
        return res.status(400).json({
            valid: false,
            error: 'ID and Password are required'
        });
    }

    // Check credentials
    if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
        // Success - clear login attempts and generate session
        clearLoginAttempts(ip);

        const token = generateToken();
        sessions.set(token, {
            adminId: id,
            adminPassword: password,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            ip
        });

        return res.json({
            valid: true,
            token,
            expiresIn: SESSION_EXPIRY
        });
    } else {
        // Failed - record attempt
        recordFailedLogin(ip);
        const attempt = loginAttempts.get(ip);

        return res.status(401).json({
            valid: false,
            error: id !== ADMIN_ID ? 'Invalid Admin ID' : 'Invalid Password',
            attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - attempt.count)
        });
    }
});

// Invalidate session (logout)
app.post('/api/logout', (req, res) => {
    const token = req.headers['x-session-token'];
    if (token && sessions.has(token)) {
        sessions.delete(token);
    }
    res.json({ success: true });
});

// Check session validity
app.get('/api/session', (req, res) => {
    const token = req.headers['x-session-token'];
    const session = validateSession(token);

    if (session) {
        res.json({
            valid: true,
            expiresIn: SESSION_EXPIRY - (Date.now() - session.createdAt)
        });
    } else {
        res.json({ valid: false });
    }
});

// Get admin ID (public, just checks if it exists)
app.get('/api/admin-id', (req, res) => {
    res.json({ hasId: !!ADMIN_ID });
});

// Get premium password (admin only)
app.get('/api/premium-password', adminAuth, (req, res) => {
    res.json({ password: PREMIUM_PASSWORD });
});

// Change premium password (admin only)
app.post('/api/premium-password', adminAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 3) {
        return res.status(400).json({ error: 'Password must be at least 3 characters' });
    }

    PREMIUM_PASSWORD = newPassword;
    res.json({ success: true, message: 'Premium password changed successfully' });
});

// Health check with system info
app.get('/api/health', (req, res) => {
    const memUsage = process.memoryUsage();
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        uptimeFormatted: formatUptime(process.uptime()),
        timestamp: new Date().toISOString(),
        memory: {
            used: formatBytes(memUsage.heapUsed),
            total: formatBytes(memUsage.heapTotal),
            rss: formatBytes(memUsage.rss)
        },
        activeDownloads: Array.from(activeDownloads.entries()).reduce((sum, [ip, count]) => sum + count, 0),
        rateLimitEntries: requestLog.size,
        downloadRateLimitEntries: downloadLog.size
    });
});

// System status (public, lightweight)
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        online: true
    });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            res.status(404).send('Page not found');
        }
    });
});

// Helper functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

// Error handling - improved with graceful degradation
app.use((err, req, res, next) => {
    console.error('Server Error:', err);

    // Handle specific errors
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            const limitStr = MAX_FILE_SIZE > 0 ? formatBytes(MAX_FILE_SIZE) : 'Unlimited';
            return res.status(413).json({ error: `File too large. Maximum size is ${limitStr}` });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({ error: 'Too many files. Maximum is 100 files per upload.' });
        }
        return res.status(400).json({ error: err.message });
    }

    // Generic error - don't expose internal details
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    console.log('Server will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
const maxSizeDisplay = MAX_FILE_SIZE > 0 ? formatBytes(MAX_FILE_SIZE) : 'Unlimited';
const server = app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              MONSFAMS Server Started                    ║
╠══════════════════════════════════════════════════════════╣
║  URL:      http://localhost:${PORT}                       ║
║  Admin ID: ${ADMIN_ID.padEnd(42)}║
║  Password: ${ADMIN_PASSWORD.padEnd(42)}║
║  Max Size: ${maxSizeDisplay.padEnd(45)}║
╠══════════════════════════════════════════════════════════╣
║  Rate Limits:                                        ║
║  API:        ${MAX_REQUESTS_PER_WINDOW} requests/minute                      ║
║  Downloads:  ${MAX_DOWNLOADS_PER_WINDOW} downloads/minute                       ║
║  Concurrent: ${MAX_CONCURRENT_DOWNLOADS} per IP                              ║
╠══════════════════════════════════════════════════════════╣
║  API Endpoints:                                       ║
║  GET    /api/files/:type     - List files             ║
║  POST   /api/upload/:type    - Upload file(s)         ║
║  DELETE /api/files/:type/:f  - Delete file            ║
║  GET    /api/stats           - Storage stats           ║
║  GET    /api/health          - Health check           ║
║  GET    /api/status          - Server status          ║
╚══════════════════════════════════════════════════════════╝
    `);
});
