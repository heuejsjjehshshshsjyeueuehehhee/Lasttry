/**
 * Auto Tracker Module
 * Logic: Loop through Next Episodes -> Extract -> Save -> Repeat
 */
const cron = require('node-cron');
const db = require('./dbAdapter');
const videoExtractor = require('./videoExtractor');
const notifier = require('./notifier');

// Anti-Ban Delay
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const autoTracker = {
    start: () => {
        console.log("⏰ Auto-Tracker Engine Started.");
        // Check every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            await autoTracker.checkAll();
        });
    },

    checkAll: async () => {
        console.log("\n🕵️‍♂️ Auto-Tracker: Bulk Scanning...");
        
        let queue = db.read('tracker_queue');
        if (queue.length === 0) return;

        let library = db.read('anime_library');
        let updatesCount = 0;

        for (let item of queue) {
            if (item.completed) continue;

            // Find Anime in Library
            let animeIndex = library.findIndex(a => a.id === item.libraryId);
            if (animeIndex === -1) continue;

            // Find/Create Season Array
            let seasonIndex = library[animeIndex].seasons.findIndex(s => s.season === item.season);
            if (seasonIndex === -1) {
                library[animeIndex].seasons.push({ season: item.season, episodes: [] });
                seasonIndex = library[animeIndex].seasons.length - 1;
            }

            let currentCheckEp = item.lastEpisode + 1;
            // Stop Condition: Target OR Total OR +12 Buffer
            let maxCheck = item.targetEpisode || item.totalEpisodes || (currentCheckEp + 12);
            let consecutiveFails = 0;

            console.log(`Checking ${item.title} (S${item.season}): Ep ${currentCheckEp} to ${maxCheck}`);

            while (currentCheckEp <= maxCheck && consecutiveFails < 3) {
                
                // 1. DUPLICATE CHECK
                let exists = library[animeIndex].seasons[seasonIndex].episodes.find(e => e.number === currentCheckEp);
                if (exists) {
                    console.log(`ℹ️ Ep ${currentCheckEp} exists. Skipping.`);
                    item.lastEpisode = currentCheckEp;
                    currentCheckEp++;
                    continue;
                }

                // 2. EXTRACTION
                const epUrl = `https://watchanimeworld.net/episode/${item.slug}-${item.season}x${currentCheckEp}/`;
                const link = await videoExtractor.extractLink(epUrl);

                if (link) {
                    // SAVE DATA
                    library[animeIndex].seasons[seasonIndex].episodes.push({
                        number: currentCheckEp,
                        url: link,
                        dateAdded: new Date().toISOString()
                    });
                    
                    console.log(`✅ FOUND: Ep ${currentCheckEp}`);
                    
                    item.lastEpisode = currentCheckEp;
                    item.lastChecked = new Date().toISOString();
                    updatesCount++;
                    consecutiveFails = 0;

                    // TARGET REACHED CHECK
                    if (item.targetEpisode && currentCheckEp >= item.targetEpisode) {
                        item.completed = true;
                        notifier.alert("Task Complete", `${item.title} reached target episode ${item.targetEpisode}.`, "success");
                        break;
                    }
                } else {
                    console.log(`❌ Ep ${currentCheckEp} not found.`);
                    consecutiveFails++;
                }

                currentCheckEp++;
                await wait(2000); // 2s Delay
            }
        }

        // Save Changes
        if (updatesCount > 0) {
            db.write('anime_library', library);
            db.write('tracker_queue', queue);
            console.log(`💾 Saved ${updatesCount} new episodes.`);
        }
    }
};

module.exports = autoTracker;