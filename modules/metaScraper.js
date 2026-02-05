/**
 * Meta Scraper Module
 * Logic: WatchAnimeWorld (Basic) + Anilist API (HQ Metadata)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

// --- TUMHARA PROXY CONFIG ---
const PROXY_HOST = "dc.oxylabs.io";
const PROXY_PORT = 8001;
const PROXY_USER = "Piro5975_mBBc7";
const PROXY_PASS = "wiF8~e_UZI5Mcje8";

const agent = new HttpsProxyAgent(`http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`);

// --- TUMHARA API ---
const CONSUMET_API = "https://testj-seven.vercel.app/meta/anilist";

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Referer': 'https://watchanimeworld.net/'
};

// Helper: Title Case
function toTitleCase(str) {
    if (!str) return "";
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

const metaScraper = {
    fetchDetails: async (seriesUrl) => {
        let data = {
            title: "Unknown Anime",
            description: "No description available.",
            thumbnail: "/uploads/default.jpg",
            genres: [],
            slug: "",
            totalEpisodes: null
        };

        try {
            // 1. Slug Extraction
            const urlObj = new URL(seriesUrl);
            const parts = urlObj.pathname.split('/').filter(p => p.length > 0);
            data.slug = parts[parts.length - 1];

            // 2. SCRAPE WEBSITE (Basic Data)
            console.log(`📄 Scraping Basic Info: ${seriesUrl}`);
            const pageResp = await axios.get(seriesUrl, { 
                httpsAgent: agent, 
                headers: HEADERS,
                timeout: 10000 
            });
            
            const $ = cheerio.load(pageResp.data);
            
            let rawTitle = $('h1.entry-title').text().trim() || $('h1').first().text().trim();
            data.title = toTitleCase(rawTitle);

            $('.genres a, .genxed a, a[rel="category tag"]').each((i, el) => {
                data.genres.push($(el).text().trim());
            });

            // 3. ANILIST API (HQ Data)
            const searchQuery = data.slug.replace(/-/g, ' ');
            console.log(`📡 Fetching HQ Metadata for: "${searchQuery}"`);

            try {
                const apiResp = await axios.get(`${CONSUMET_API}/${encodeURIComponent(searchQuery)}`);
                
                if (apiResp.data.results && apiResp.data.results.length > 0) {
                    const anime = apiResp.data.results[0];
                    data.thumbnail = anime.image || data.thumbnail;
                    if (anime.description) {
                        data.description = anime.description.replace(/<[^>]*>?/gm, ''); 
                    }
                    if (anime.totalEpisodes) {
                         data.totalEpisodes = anime.totalEpisodes;
                    }
                    console.log("✅ Metadata Synced with Anilist");
                }
            } catch (apiErr) {
                console.log("⚠️ Anilist API Error (Using Basic Data):", apiErr.message);
            }

        } catch (error) {
            console.error("❌ Scraper Error:", error.message);
            throw new Error("Failed to fetch details");
        }

        return data;
    }
};

module.exports = metaScraper;