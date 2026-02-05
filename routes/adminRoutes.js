const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');

const db = require('../modules/dbAdapter');
const metaScraper = require('../modules/metaScraper');
const autoTracker = require('../modules/autoTracker');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => cb(null, 'logo_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

router.use(requireAuth, requireAdmin);

// DASHBOARD
router.get('/dashboard', (req, res) => {
    const library = db.read('anime_library');
    let totalEpisodes = 0;
    if(library) library.forEach(a => a.seasons.forEach(s => totalEpisodes += s.episodes.length));
    res.render('admin/dashboard', { stats: { totalAnime: library ? library.length : 0, totalEpisodes }, notifications: [] });
});

// MANAGE ANIME
router.get('/manage-anime', (req, res) => {
    const library = db.read('anime_library');
    res.render('admin/manage_anime', { library });
});

router.post('/delete-anime', (req, res) => {
    const { animeId } = req.body;
    let library = db.read('anime_library');
    db.write('anime_library', library.filter(a => a.id != animeId));
    let queue = db.read('tracker_queue');
    db.write('tracker_queue', queue.filter(q => q.libraryId != animeId));
    res.redirect('/admin/manage-anime?msg=Deleted');
});

// --- 🔥 TRENDING WITH RANKING ---
router.get('/trending', (req, res) => {
    const library = db.read('anime_library');
    const trendingIds = db.read('trending') || [];
    res.render('admin/manage_trending', { library, trendingIds });
});

router.post('/trending', (req, res) => {
    // Form sends arrays: animeIds[] and ranks[]
    const { animeIds, ranks } = req.body;

    if (!animeIds || !ranks) {
        return res.redirect('/admin/trending?msg=Error');
    }

    let trendingList = [];

    // Loop through all inputs
    for (let i = 0; i < animeIds.length; i++) {
        const id = animeIds[i];
        const rankVal = parseInt(ranks[i]);

        // Sirf unhe save karo jinka rank > 0 hai
        if (!isNaN(rankVal) && rankVal > 0) {
            trendingList.push({ id: id, rank: rankVal });
        }
    }

    // Sort by Rank (1, 2, 3...)
    trendingList.sort((a, b) => a.rank - b.rank);

    // Extract only IDs in sorted order
    const sortedIds = trendingList.map(item => item.id);

    db.write('trending', sortedIds);
    res.redirect('/admin/trending?msg=Trending Updated');
});

// ADD ANIME (Single/Multi Season Fix)
router.get('/add-anime', (req, res) => res.render('admin/add_anime'));

router.post('/add-anime', async (req, res) => {
    try {
        let { url, type, seasons, startEps, endEps } = req.body;
        
        // Handling Single vs Array Inputs
        if (!seasons) return res.redirect('/admin/add-anime?error=No Data');
        
        // Fallback for old forms
        if(!startEps && req.body.episode) startEps = req.body.episode;
        if(!endEps && req.body.targetEpisode) endEps = req.body.targetEpisode;
        if(!seasons && req.body.season) seasons = req.body.season;

        if (!Array.isArray(seasons)) {
            seasons = [seasons];
            startEps = [startEps];
            endEps = [endEps];
        }

        const meta = await metaScraper.fetchDetails(url);
        let library = db.read('anime_library');
        let queue = db.read('tracker_queue');
        
        let animeId;
        let existingAnime = library.find(a => a.slug === meta.slug);
        
        if (existingAnime) {
            animeId = existingAnime.id;
            existingAnime.type = type;
        } else {
            animeId = uuidv4();
            const newAnime = { id: animeId, ...meta, type: type || 'TV', seasons: [] };
            library.push(newAnime);
            existingAnime = newAnime;
        }

        for (let i = 0; i < seasons.length; i++) {
            const seasonNum = parseInt(seasons[i]);
            const start = parseInt(startEps[i]);
            const end = parseInt(endEps[i] || start);

            // Add to Library
            let seasonObj = existingAnime.seasons.find(s => s.season === seasonNum);
            if (!seasonObj) {
                seasonObj = { season: seasonNum, episodes: [] };
                existingAnime.seasons.push(seasonObj);
            }

            // Tracker logic...
            let alreadyTracking = queue.find(q => q.slug === meta.slug && q.season === seasonNum);
            if (!alreadyTracking) {
                db.push('tracker_queue', {
                    id: Date.now() + i,
                    libraryId: animeId,
                    title: meta.title,
                    slug: meta.slug,
                    season: seasonNum,
                    lastEpisode: start - 1,
                    targetEpisode: end,
                    totalEpisodes: meta.totalEpisodes,
                    url: url,
                    completed: false
                });
            } else {
                alreadyTracking.lastEpisode = start - 1;
                alreadyTracking.targetEpisode = end;
                alreadyTracking.completed = false;
                db.write('tracker_queue', queue);
            }
        }

        db.write('anime_library', library);
        autoTracker.checkAll();
        res.redirect('/admin/dashboard?msg=Anime Added');

    } catch (error) {
        console.error(error);
        res.redirect('/admin/add-anime?error=Failed');
    }
});

// SETTINGS & API
router.get('/settings', (req, res) => res.render('admin/settings'));
router.post('/settings', upload.single('logo'), (req, res) => {
    let settings = db.read('site_settings');
    let newSettings = { ...settings, ...req.body, maintenanceMode: req.body.maintenanceMode === 'on' };
    if (req.file) newSettings.logoUrl = '/uploads/' + req.file.filename;
    require('fs').writeFileSync(path.join(__dirname, '../data/site_settings.json'), JSON.stringify(newSettings, null, 4));
    res.redirect('/admin/settings?msg=Saved');
});

router.post('/scrape', async (req, res) => {
    const { url } = req.body;
    const { extractLink } = require('../modules/videoExtractor');
    const link = await extractLink(url);
    res.json({ data: [{ title: "Result", url: link || "No Link" }] });
});

module.exports = router;
