/**
 * AnimeVerse-Pro: Startup Script
 * Final Production Version
 */

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const flash = require('connect-flash');
const config = require('./config.json');

// --- APP SETUP ---
const app = express();
const PORT = config.server.port || 24961;

// --- DIRECTORY SETUP ---
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');

function initializeSystem() {
    console.log("⚙️  Initializing AnimeVerse-Pro System...");

    // Create Directories
    [DATA_DIR, PUBLIC_DIR, UPLOADS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    // Create Database Files
    const dbFiles = {
        'users.json': [],
        'anime_library.json': [],
        'tracker_queue.json': [],
        'notifications.json': [],
        'site_settings.json': {
            siteName: "AnimeVerse Pro",
            themeColor: "#3498db",
            logoUrl: null,
            maintenanceMode: false
        }
    };

    for (const [filename, defaultData] of Object.entries(dbFiles)) {
        const filePath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 4));
        }
    }

    // Create Admin User
    const usersPath = path.join(DATA_DIR, 'users.json');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    if (users.length === 0) {
        const hashedPassword = bcrypt.hashSync(config.initialAdmin.password, 10);
        users.push({
            id: 1,
            username: config.initialAdmin.username,
            password: hashedPassword,
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        fs.writeFileSync(usersPath, JSON.stringify(users, null, 4));
        console.log(`   [AUTH] Admin Created: ${config.initialAdmin.username}`);
    }
}

initializeSystem();

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
    secret: config.server.secretKey,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 } // 24 Hours
}));

app.use(flash());

// Site Config & Global Variables
const siteConfig = require('./middleware/siteConfig'); // Ensure this file exists
app.use(siteConfig);

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.user = req.session.user || null;
    next();
});

// --- ROUTES (Direct Import - No Try/Catch) ---
// Agar yahan error aaya, toh console batayega ki konsi file missing hai
const indexRoutes = require('./routes/indexRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

app.use('/', indexRoutes);
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);

// --- START AUTO-TRACKER ---
const autoTracker = require('./modules/autoTracker');
autoTracker.start();

// --- SERVER LAUNCH ---
app.listen(PORT, () => {
    console.log(`\n🚀 AnimeVerse-Pro is Live!`);
    console.log(`🌍 URL: http://localhost:${PORT}`);
    console.log(`🔑 Admin: http://localhost:${PORT}/auth/login`);
});