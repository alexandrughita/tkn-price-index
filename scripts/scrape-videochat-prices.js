#!/usr/bin/env node
/**
 * Scrapes videochat platform token pricing and updates data/videochat.json
 * Run: node scripts/scrape-videochat-prices.js [--dry-run]
 *
 * Sources: affiliate program pages, FAQ pages, and token purchase pages.
 * Videochat token prices change rarely — runs monthly.
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const VIDEOCHAT_PATH = path.join(__dirname, '..', 'data', 'videochat.json');

// Known pricing sources for each platform
const PLATFORMS = {
    chaturbate: {
        // Chaturbate FAQ and token purchase page
        urls: [
            'https://chaturbate.com/accounts/token_purchase/',
            'https://chaturbate.com/faq/'
        ],
        extractBuyPrice(texts) {
            // Token packages: 100 for $10.99, 200 for $20.99, 500 for $44.99, 750 for $62.99, 1000 for $79.99
            // Look for price per token patterns
            for (const text of texts) {
                // Pattern: "X tokens for $Y" or "$Y for X tokens"
                const packages = [];
                const re = /(\d+)\s*tokens?\s*(?:for|=|:)?\s*\$([0-9.]+)/gi;
                let m;
                while ((m = re.exec(text)) !== null) {
                    packages.push({ tokens: parseInt(m[1]), price: parseFloat(m[2]) });
                }
                if (packages.length > 0) {
                    // Use the mid-range package for average price
                    packages.sort((a, b) => a.tokens - b.tokens);
                    const mid = packages[Math.floor(packages.length / 2)];
                    return mid.price / mid.tokens;
                }
            }
            return null;
        },
        extractPayout(texts) {
            // Chaturbate payout: $0.05/token (5 cents) is the standard rate
            for (const text of texts) {
                const m = text.match(/(?:earn|payout|receive|paid)\s*\$?([0-9.]+)\s*(?:per|\/)\s*token/i);
                if (m) return parseFloat(m[1]);
                // "5 cents per token"
                const m2 = text.match(/([0-9.]+)\s*cents?\s*per\s*token/i);
                if (m2) return parseFloat(m2[1]) / 100;
            }
            return null;
        },
        defaults: { buy_price: 0.09, payout: 0.05, platform_cut: 45 }
    },
    livejasmin: {
        urls: [
            'https://www.livejasmin.com/en/info/faq'
        ],
        extractBuyPrice(texts) {
            for (const text of texts) {
                const m = text.match(/(\d+)\s*credits?\s*(?:for|=|:)?\s*\$([0-9.]+)/i);
                if (m) return parseFloat(m[2]) / parseInt(m[1]);
                // Or "credit costs $X"
                const m2 = text.match(/credits?\s*(?:costs?|price)\s*\$([0-9.]+)/i);
                if (m2) return parseFloat(m2[1]);
            }
            return null;
        },
        extractPayout(texts) {
            for (const text of texts) {
                const m = text.match(/(?:models?|performers?)\s*(?:earn|receive|get|paid)\s*(?:up\s*to\s*)?\$?([0-9.]+)\s*(?:per|\/)\s*(?:credit|minute)/i);
                if (m) return parseFloat(m[1]);
            }
            return null;
        },
        defaults: { buy_price: 0.85, payout: 0.40, platform_cut: 53 }
    },
    stripchat: {
        urls: [
            'https://stripchat.com/faq'
        ],
        extractBuyPrice(texts) {
            for (const text of texts) {
                const packages = [];
                const re = /(\d+)\s*tokens?\s*(?:for|=|:)?\s*\$([0-9.]+)/gi;
                let m;
                while ((m = re.exec(text)) !== null) {
                    packages.push({ tokens: parseInt(m[1]), price: parseFloat(m[2]) });
                }
                if (packages.length > 0) {
                    packages.sort((a, b) => a.tokens - b.tokens);
                    const mid = packages[Math.floor(packages.length / 2)];
                    return mid.price / mid.tokens;
                }
            }
            return null;
        },
        extractPayout(texts) {
            for (const text of texts) {
                const m = text.match(/(?:earn|payout|receive|paid)\s*\$?([0-9.]+)\s*(?:per|\/)\s*token/i);
                if (m) return parseFloat(m[1]);
            }
            return null;
        },
        defaults: { buy_price: 0.11, payout: 0.05, platform_cut: 55 }
    },
    bongacams: {
        urls: [
            'https://bongacams.com/faq'
        ],
        extractBuyPrice(texts) {
            for (const text of texts) {
                const packages = [];
                const re = /(\d+)\s*tokens?\s*(?:for|=|:)?\s*\$([0-9.]+)/gi;
                let m;
                while ((m = re.exec(text)) !== null) {
                    packages.push({ tokens: parseInt(m[1]), price: parseFloat(m[2]) });
                }
                if (packages.length > 0) {
                    packages.sort((a, b) => a.tokens - b.tokens);
                    const mid = packages[Math.floor(packages.length / 2)];
                    return mid.price / mid.tokens;
                }
            }
            return null;
        },
        extractPayout(texts) {
            for (const text of texts) {
                const m = text.match(/(?:earn|payout|receive|paid)\s*\$?([0-9.]+)\s*(?:per|\/)\s*token/i);
                if (m) return parseFloat(m[1]);
            }
            return null;
        },
        defaults: { buy_price: 0.075, payout: 0.05, platform_cut: 33 }
    },
    myfreecams: {
        urls: [
            'https://wiki.myfreecams.com/wiki/Token'
        ],
        extractBuyPrice(texts) {
            for (const text of texts) {
                const packages = [];
                const re = /(\d+)\s*tokens?\s*(?:for|=|:)?\s*\$([0-9.]+)/gi;
                let m;
                while ((m = re.exec(text)) !== null) {
                    packages.push({ tokens: parseInt(m[1]), price: parseFloat(m[2]) });
                }
                if (packages.length > 0) {
                    packages.sort((a, b) => a.tokens - b.tokens);
                    const mid = packages[Math.floor(packages.length / 2)];
                    return mid.price / mid.tokens;
                }
            }
            return null;
        },
        extractPayout(texts) {
            for (const text of texts) {
                const m = text.match(/(?:earn|payout|receive|paid)\s*\$?([0-9.]+)\s*(?:per|\/)\s*token/i);
                if (m) return parseFloat(m[1]);
                const m2 = text.match(/([0-9.]+)\s*cents?\s*per\s*token/i);
                if (m2) return parseFloat(m2[1]) / 100;
            }
            return null;
        },
        defaults: { buy_price: 0.10, payout: 0.05, platform_cut: 50 }
    }
};

async function fetchPage(url) {
    console.log(`  Fetching ${url}...`);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TKN-Price-Index/1.0)',
                'Accept': 'text/html,application/xhtml+xml'
            },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        // Strip HTML tags
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        return null;
    }
}

async function scrapePlatform(platformId, config) {
    console.log(`\n[${platformId}]`);

    const texts = [];
    for (const url of config.urls) {
        const text = await fetchPage(url);
        if (text) texts.push(text);
    }

    if (texts.length === 0) {
        console.log(`  ✗ All fetches failed, using defaults`);
        return { ...config.defaults, source: 'defaults' };
    }

    const buyPrice = config.extractBuyPrice(texts);
    const payout = config.extractPayout(texts);

    const result = {
        buy_price: buyPrice || config.defaults.buy_price,
        payout: payout || config.defaults.payout,
        source: buyPrice || payout ? 'scraped' : 'defaults'
    };

    if (buyPrice && payout) {
        result.platform_cut = Math.round((1 - payout / buyPrice) * 100);
    } else {
        result.platform_cut = config.defaults.platform_cut;
    }

    console.log(`  Buy: $${result.buy_price.toFixed(3)}/token (${buyPrice ? 'scraped' : 'default'})`);
    console.log(`  Payout: $${result.payout.toFixed(3)}/token (${payout ? 'scraped' : 'default'})`);
    console.log(`  Platform cut: ${result.platform_cut}%`);

    return result;
}

async function main() {
    console.log('TKN Price Index — Videochat Token Scraper');
    console.log('==========================================');
    if (DRY_RUN) console.log('(DRY RUN — no files will be modified)\n');

    const data = JSON.parse(fs.readFileSync(VIDEOCHAT_PATH, 'utf-8'));
    const changes = [];

    for (const [platformId, config] of Object.entries(PLATFORMS)) {
        const result = await scrapePlatform(platformId, config);

        const model = data.models.find(m => m.provider === platformId);
        if (!model) {
            console.log(`  ⚠ No model entry for ${platformId}`);
            continue;
        }

        const changed =
            model.buy_price_per_token !== result.buy_price ||
            model.payout_per_token !== result.payout ||
            model.platform_cut_pct !== result.platform_cut;

        if (changed) {
            changes.push({
                platform: platformId,
                old_buy: model.buy_price_per_token,
                new_buy: result.buy_price,
                old_payout: model.payout_per_token,
                new_payout: result.payout,
                old_cut: model.platform_cut_pct,
                new_cut: result.platform_cut
            });

            if (!DRY_RUN) {
                model.buy_price_per_token = result.buy_price;
                model.payout_per_token = result.payout;
                model.platform_cut_pct = result.platform_cut;
            }
        }
    }

    // Report
    console.log('\n==========================================');
    if (changes.length === 0) {
        console.log('No price changes detected.');
    } else {
        console.log(`${changes.length} price change(s) detected:\n`);
        for (const c of changes) {
            console.log(`  ${c.platform}:`);
            if (c.old_buy !== c.new_buy) console.log(`    Buy:  $${c.old_buy} → $${c.new_buy}`);
            if (c.old_payout !== c.new_payout) console.log(`    Payout: $${c.old_payout} → $${c.new_payout}`);
            if (c.old_cut !== c.new_cut) console.log(`    Cut: ${c.old_cut}% → ${c.new_cut}%`);
        }

        if (!DRY_RUN) {
            fs.writeFileSync(VIDEOCHAT_PATH, JSON.stringify(data, null, 2) + '\n');
            console.log(`\nUpdated ${VIDEOCHAT_PATH}`);
        }
    }

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${changes.length}\n`);
    }

    return changes.length;
}

main().then(() => process.exit(0)).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
