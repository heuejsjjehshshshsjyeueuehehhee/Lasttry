/**
 * Video Extractor Module
 * Logic: Base64 Decoder -> Unshortener -> M3U8 Extraction
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// --- PROXY SETTINGS ---
const PROXY_HOST = "dc.oxylabs.io";
const PROXY_PORT = 8001;
const PROXY_USER = "Piro5975_mBBc7";
const PROXY_PASS = "wiF8~e_UZI5Mcje8";

const agent = new HttpsProxyAgent(`http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`);

const TIMEOUT_MS = 8000;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://watchanimeworld.net/',
    'Accept': '*/*'
};

// --- HELPER FUNCTIONS ---
async function safeGet(url) {
    try {
        const response = await axios.get(url, { 
            httpsAgent: agent, 
            headers: HEADERS, 
            timeout: TIMEOUT_MS,
            validateStatus: status => status < 400
        });
        return response;
    } catch (e) { return null; }
}

async function unshortenLink(url) {
    if (!url) return null;
    const resp = await safeGet(url);
    return resp ? (resp.request.res.responseUrl || url) : url;
}

async function extractM3U8(pageUrl) {
    const resp = await safeGet(pageUrl);
    if (!resp) return null;
    const html = resp.data;
    
    // M3U8 Regex Pattern
    let match = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (match) return match[1];
    
    match = html.match(/source\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (match) return match[1];

    return null;
}

const videoExtractor = {
    extractLink: async (episodeUrl) => {
        // console.log(`⚡ Scanning: ${episodeUrl}`); 
        let resultData = { masterUrl: null, embedUrl: null, shortIcuLink: null };

        const resp = await safeGet(episodeUrl);
        if (!resp) {
            return null; // Page load failed
        }

        const html = resp.data;

        // --- STRATEGY 1: API HUNTER (Base64 Decode) ---
        // Finding hidden JSON data in source code
        const apiRegex = /(https?:\/\/[^\s"']+\?data=([a-zA-Z0-9+/=]+))/g;
        let match;
        let found = false;

        while ((match = apiRegex.exec(html)) !== null) {
            const base64Data = match[2];
            try {
                const decoded = Buffer.from(base64Data, 'base64').toString('utf-8');
                
                // Check if decoded data contains link info
                if (decoded.includes('link') || decoded.includes('short.icu')) {
                    const parsed = JSON.parse(decoded);
                    if (Array.isArray(parsed)) {
                        // Priority: Hindi -> Else First Available
                        const targetEntry = parsed.find(x => x.language === 'Hindi') || parsed[0];
                        
                        if (targetEntry && targetEntry.link) {
                            let shortLink = targetEntry.link.replace(/\\\//g, '/');
                            resultData.shortIcuLink = shortLink;
                            
                            // Unshorten to get Real Player Link
                            const realUrl = await unshortenLink(shortLink);
                            resultData.embedUrl = realUrl;

                            // Extract M3U8 for Best Quality
                            const m3u8 = await extractM3U8(realUrl);
                            if (m3u8) resultData.masterUrl = m3u8;
                            
                            found = true;
                            break;
                        }
                    }
                }
            } catch (e) {}
        }

        // --- STRATEGY 2: IFRAME SCANNER (Fallback) ---
        if (!found) {
            const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/g;
            let ifMatch;
            while ((ifMatch = iframeRegex.exec(html)) !== null) {
                const src = ifMatch[1];
                if (src.includes('zephyr') || src.includes('oxaam') || src.includes('player')) {
                    resultData.embedUrl = src;
                    const m3u8 = await extractM3U8(src);
                    if(m3u8) {
                        resultData.masterUrl = m3u8;
                        break;
                    }
                }
            }
        }
        
        // Return Best Link Found
        const finalLink = resultData.masterUrl || resultData.embedUrl || resultData.shortIcuLink;
        if(finalLink) console.log(`✅ Extracted Link: ${finalLink}`);
        
        return finalLink;
    }
};

module.exports = videoExtractor;