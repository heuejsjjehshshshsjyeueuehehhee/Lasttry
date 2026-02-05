const express = require('express');
const router = express.Router();
const db = require('../modules/dbAdapter');
const siteConfig = require('../middleware/siteConfig');

// Middleware to load site settings
router.use(siteConfig);

// 🏠 HOME PAGE
router.get('/', (req, res) => {
    const library = db.read('anime_library');
    const trendingIds = db.read('trending');

    let trendingList = [];
    if (trendingIds && trendingIds.length > 0) {
        trendingList = trendingIds.map(id => library.find(a => a.id === id)).filter(a => a);
    }

    // Hero Anime logic
    const heroAnime = trendingList.length > 0 ? trendingList[0] : (library.length > 0 ? library[0] : null);
    
    // Latest Updates
    const latestAnime = [...library].reverse().slice(0, 12);

    res.render('index', {
        title: 'Home',
        heroAnime, 
        trendingList, 
        animeList: latestAnime,
        sectionTitle: 'Latest Additions', 
        user: req.user || null
    });
});

// ℹ️ DETAILS PAGE
router.get('/anime/:slug', (req, res) => {
    const slug = req.params.slug;
    const library = db.read('anime_library');
    const anime = library.find(a => a.slug === slug);
    
    if (!anime) return res.status(404).render('404');
    
    res.render('details', { 
        title: anime.title,
        anime, 
        user: req.user || null 
    });
});

// 🎬 WATCH PAGE (Smart Episode Logic)
router.get('/watch/:slug', (req, res) => {
    const slug = req.params.slug;
    const library = db.read('anime_library');
    const anime = library.find(a => a.slug === slug);

    if (!anime) return res.status(404).send("Anime not found");

    // Get Season & Episode from Query (Default: 1)
    let seasonNum = req.query.season ? parseInt(req.query.season) : 1;
    let episodeNum = req.query.episode ? parseInt(req.query.episode) : 1;

    // Find Season
    let seasonData = anime.seasons.find(s => s.season === seasonNum);
    
    // Fallback: If season not found, use first season
    if (!seasonData && anime.seasons.length > 0) {
        seasonData = anime.seasons[0];
        seasonNum = seasonData.season;
    }

    let currentEpisode = null;
    if (seasonData) {
        // 1. Try finding by explicit number
        currentEpisode = seasonData.episodes.find(e => e.episode === episodeNum);
        
        // 2. Fallback: Use Array Index
        if (!currentEpisode) {
            if (seasonData.episodes.length >= episodeNum) {
                currentEpisode = seasonData.episodes[episodeNum - 1];
                if(currentEpisode) currentEpisode.episode = episodeNum; 
            }
        }

        // 3. Last Resort: First Episode
        if (!currentEpisode && seasonData.episodes.length > 0) {
            currentEpisode = seasonData.episodes[0];
            currentEpisode.episode = 1;
            episodeNum = 1;
        }
    }

    if (!currentEpisode) return res.status(404).send("No episodes available.");

    // Next Episode Logic
    let nextEpisodeLink = null;
    let totalEpisodesInSeason = seasonData ? seasonData.episodes.length : 0;
    
    if (episodeNum < totalEpisodesInSeason) {
        nextEpisodeLink = `/watch/${slug}?season=${seasonNum}&episode=${episodeNum + 1}`;
    } else {
        let nextSeason = anime.seasons.find(s => s.season === seasonNum + 1);
        if (nextSeason && nextSeason.episodes.length > 0) {
            nextEpisodeLink = `/watch/${slug}?season=${nextSeason.season}&episode=1`;
        }
    }

    res.render('watch', {
        title: `Watch ${anime.title}`,
        anime, 
        currentSeason: seasonNum, 
        currentEpisode,
        nextEpisodeLink,
        user: req.user || null
    });
});

// 🔍 STANDARD SEARCH PAGE (HTML Render)
router.get('/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const library = db.read('anime_library');
    
    let results = [];
    if (query) {
        results = library.filter(a => a.title.toLowerCase().includes(query));
    }

    res.render('search', { 
        title: `Search: ${query}`,
        results: results, 
        searchQuery: query, 
        user: req.user || null 
    });
});

// ⚡ API: LIVE SEARCH (Returns JSON for Dropdown)
router.get('/api/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const library = db.read('anime_library');
    
    let results = [];
    if (query.length > 1) {
        // Limit results to top 5 for speed
        results = library.filter(a => a.title.toLowerCase().includes(query)).slice(0, 5);
    }

    res.json(results);
});

// ⚡ API: QUICK PLAY (Returns Video Link for Floating Player)
router.get('/api/quick-play/:slug', (req, res) => {
    const slug = req.params.slug;
    const library = db.read('anime_library');
    const anime = library.find(a => a.slug === slug);

    if (anime && anime.seasons.length > 0 && anime.seasons[0].episodes.length > 0) {
        res.json({
            found: true,
            title: anime.title,
            thumbnail: anime.thumbnail,
            videoUrl: anime.seasons[0].episodes[0].url
        });
    } else {
        res.json({ found: false });
    }
});

module.exports = router;