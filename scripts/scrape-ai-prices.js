#!/usr/bin/env node
/**
 * Scrapes AI provider pricing pages and updates data/models.json
 * Run: node scripts/scrape-ai-prices.js [--dry-run]
 *
 * Strategy: fetch pricing pages, extract prices from HTML tables/JSON,
 * validate against current data (reject changes >5x), and update.
 *
 * Many pricing pages are SPAs or block scrapers, so this uses multiple
 * strategies per provider and validates aggressively.
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const MODELS_PATH = path.join(__dirname, '..', 'data', 'models.json');
const HISTORY_DIR = path.join(__dirname, '..', 'data', 'history');

// Max factor a price can change before we flag it as suspicious
const MAX_CHANGE_FACTOR = 5;

const SCRAPE_CONFIGS = [
    {
        provider: 'anthropic',
        urls: [
            'https://docs.anthropic.com/en/docs/about-claude/models',
            'https://anthropic.com/pricing'
        ],
        extract(html) {
            const results = {};
            // Anthropic docs page has pricing in tables with model names and $/MTok
            // Strategy: find table rows with model names and dollar amounts

            // Look for JSON-LD or embedded data first
            const jsonMatch = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g);
            if (jsonMatch) {
                for (const block of jsonMatch) {
                    const json = block.replace(/<\/?script[^>]*>/g, '');
                    try {
                        const data = JSON.parse(json);
                        const text = JSON.stringify(data);
                        this._extractFromText(text, results);
                    } catch {}
                }
            }

            // Fallback: extract from table rows
            // Look for <tr> containing model name and two price cells
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let row;
            while ((row = rowRegex.exec(html)) !== null) {
                const cells = row[1].match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
                if (!cells || cells.length < 3) continue;
                const text = cells.map(c => c.replace(/<[^>]+>/g, '').trim()).join(' | ');
                this._extractFromText(text, results);
            }

            // Final fallback: stripped text
            const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            this._extractFromText(stripped, results);

            return results;
        },
        _extractFromText(text, results) {
            const models = [
                { id: 'claude-opus-4-6',   pattern: /claude[\s.-]*opus[\s.-]*4[\s.-]*6/i },
                { id: 'claude-sonnet-4-6',  pattern: /claude[\s.-]*sonnet[\s.-]*4[\s.-]*6/i },
                { id: 'claude-haiku-4-5',   pattern: /claude[\s.-]*haiku[\s.-]*4[\s.-]*5/i },
                { id: 'claude-sonnet-4-5',  pattern: /claude[\s.-]*sonnet[\s.-]*4[\s.-]*5/i },
                { id: 'claude-opus-4-1',    pattern: /claude[\s.-]*opus[\s.-]*4[\s.-]*1/i },
                { id: 'claude-3-haiku',     pattern: /claude[\s.-]*3[\s.-]*haiku/i },
            ];
            for (const m of models) {
                if (results[m.id]) continue;
                const idx = text.search(m.pattern);
                if (idx === -1) continue;
                // Look for the next two dollar amounts after the model name (within 200 chars)
                const after = text.slice(idx, idx + 300);
                const prices = [...after.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)];
                if (prices.length >= 2) {
                    const input = parseFloat(prices[0][1]);
                    const output = parseFloat(prices[1][1]);
                    // Sanity: input should be less than output for AI models
                    if (input > 0 && output > 0 && output >= input) {
                        results[m.id] = { input_price: input, output_price: output };
                    }
                }
            }
        }
    },
    {
        provider: 'openai',
        urls: [
            'https://platform.openai.com/docs/pricing',
            'https://openai.com/api/pricing'
        ],
        extract(html) {
            const results = {};
            const models = [
                { id: 'gpt-5.4',       pattern: /gpt[\s-]*5\.4/i },
                { id: 'gpt-5.2',       pattern: /gpt[\s-]*5\.2/i },
                { id: 'gpt-5.1',       pattern: /gpt[\s-]*5\.1(?!\s*mini)/i },
                { id: 'gpt-5-mini',    pattern: /gpt[\s-]*5[\s-]*mini/i },
                { id: 'gpt-5-nano',    pattern: /gpt[\s-]*5[\s-]*nano/i },
                { id: 'gpt-4.1',       pattern: /gpt[\s-]*4\.1(?![\s-]*(?:mini|nano))/i },
                { id: 'gpt-4.1-mini',  pattern: /gpt[\s-]*4\.1[\s-]*mini/i },
                { id: 'gpt-4.1-nano',  pattern: /gpt[\s-]*4\.1[\s-]*nano/i },
                { id: 'gpt-4o',        pattern: /gpt[\s-]*4o(?![\s-]*mini)/i },
                { id: 'gpt-4o-mini',   pattern: /gpt[\s-]*4o[\s-]*mini/i },
                { id: 'o3',            pattern: /\bo3(?![\s-]*mini)/i },
                { id: 'o3-mini',       pattern: /o3[\s-]*mini/i },
                { id: 'o4-mini',       pattern: /o4[\s-]*mini/i },
            ];

            // Try JSON data first (Next.js pages embed data in __NEXT_DATA__)
            const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (nextData) {
                try {
                    const data = JSON.parse(nextData[1]);
                    const text = JSON.stringify(data);
                    extractModelsFromText(text, models, results);
                } catch {}
            }

            // Try table rows
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let row;
            while ((row = rowRegex.exec(html)) !== null) {
                const text = row[1].replace(/<[^>]+>/g, ' ').trim();
                extractModelsFromText(text, models, results);
            }

            // Stripped text fallback
            const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            extractModelsFromText(stripped, models, results);

            return results;
        }
    },
    {
        provider: 'google',
        urls: [
            'https://ai.google.dev/pricing',
            'https://cloud.google.com/vertex-ai/generative-ai/pricing'
        ],
        extract(html) {
            const results = {};
            const models = [
                { id: 'gemini-3.1-pro',        pattern: /gemini[\s-]*3\.1[\s-]*pro/i },
                { id: 'gemini-3.1-flash-lite',  pattern: /gemini[\s-]*3\.1[\s-]*flash[\s-]*lite/i },
                { id: 'gemini-2.5-pro',         pattern: /gemini[\s-]*2\.5[\s-]*pro/i },
                { id: 'gemini-2.5-flash',       pattern: /gemini[\s-]*2\.5[\s-]*flash(?![\s-]*lite)/i },
                { id: 'gemini-2.5-flash-lite',  pattern: /gemini[\s-]*2\.5[\s-]*flash[\s-]*lite/i },
            ];

            // Google pricing page uses tables
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let row;
            while ((row = rowRegex.exec(html)) !== null) {
                const text = row[1].replace(/<[^>]+>/g, ' ').trim();
                extractModelsFromText(text, models, results);
            }

            const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            extractModelsFromText(stripped, models, results);

            return results;
        }
    },
    {
        provider: 'mistral',
        urls: [
            'https://docs.mistral.ai/getting-started/pricing/',
            'https://mistral.ai/pricing'
        ],
        extract(html) {
            const results = {};
            const models = [
                { id: 'mistral-large-3',    pattern: /mistral[\s-]*large[\s-]*3/i },
                { id: 'mistral-medium-3.1', pattern: /mistral[\s-]*medium[\s-]*3\.1/i },
                { id: 'mistral-small-3.2',  pattern: /mistral[\s-]*small[\s-]*3\.2/i },
                { id: 'mistral-small-3.1',  pattern: /mistral[\s-]*small[\s-]*3\.1/i },
                { id: 'codestral',          pattern: /codestral(?![\s-]*mamba)/i },
                { id: 'magistral-medium',   pattern: /magistral[\s-]*medium/i },
                { id: 'ministral-8b',       pattern: /ministral[\s-]*8b/i },
                { id: 'mistral-nemo',       pattern: /mistral[\s-]*nemo/i },
            ];

            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let row;
            while ((row = rowRegex.exec(html)) !== null) {
                const text = row[1].replace(/<[^>]+>/g, ' ').trim();
                extractModelsFromText(text, models, results);
            }

            const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            extractModelsFromText(stripped, models, results);

            return results;
        }
    },
    {
        provider: 'xai',
        urls: [
            'https://docs.x.ai/docs/models'
        ],
        extract(html) {
            const results = {};
            const models = [
                { id: 'grok-4.20-beta',    pattern: /grok[\s-]*4\.20/i },
                { id: 'grok-4-1-fast',     pattern: /grok[\s-]*4[\s-]*1[\s-]*fast/i },
                { id: 'grok-4-fast',       pattern: /grok[\s-]*4[\s-]*fast(?![\s-]*1)/i },
                { id: 'grok-code-fast-1',  pattern: /grok[\s-]*code[\s-]*fast/i },
                { id: 'grok-4',            pattern: /grok[\s-]*4(?![\s.-]*(?:fast|1|20|\d))/i },
                { id: 'grok-3',            pattern: /grok[\s-]*3(?![\s-]*mini)/i },
                { id: 'grok-3-mini',       pattern: /grok[\s-]*3[\s-]*mini/i },
            ];

            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let row;
            while ((row = rowRegex.exec(html)) !== null) {
                const text = row[1].replace(/<[^>]+>/g, ' ').trim();
                extractModelsFromText(text, models, results);
            }

            const stripped = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
            extractModelsFromText(stripped, models, results);

            return results;
        }
    }
];

/**
 * Generic extractor: given text with a model name followed by dollar amounts,
 * find the first two $ values after the model name within a reasonable window.
 */
function extractModelsFromText(text, models, results) {
    for (const m of models) {
        if (results[m.id]) continue;

        const idx = text.search(m.pattern);
        if (idx === -1) continue;

        // Look within 200 chars after model name for price pairs
        const window = text.slice(idx, idx + 250);
        const prices = [...window.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)/g)];

        if (prices.length >= 2) {
            const p1 = parseFloat(prices[0][1]);
            const p2 = parseFloat(prices[1][1]);

            // For AI models: input < output (or equal for some budget models)
            // Both should be positive and reasonable (< $200/1M tokens)
            if (p1 > 0 && p2 > 0 && p1 <= 200 && p2 <= 200 && p2 >= p1) {
                results[m.id] = { input_price: p1, output_price: p2 };
            }
        }
    }
}

async function fetchPage(url) {
    console.log(`  Fetching ${url}...`);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: AbortSignal.timeout(15000),
            redirect: 'follow'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        return null;
    }
}

async function scrapeProvider(config) {
    const providerId = config.provider;
    console.log(`\n[${providerId}]`);

    let allResults = {};

    for (const url of config.urls) {
        const html = await fetchPage(url);
        if (!html) continue;

        const results = config.extract(html);
        // Merge — first successful extraction wins per model
        for (const [id, prices] of Object.entries(results)) {
            if (!allResults[id]) allResults[id] = prices;
        }
    }

    const count = Object.keys(allResults).length;
    console.log(`  Found ${count} models`);
    for (const [id, p] of Object.entries(allResults)) {
        console.log(`    ${id}: $${p.input_price} / $${p.output_price}`);
    }

    return allResults;
}

function validateChange(model, newPrices) {
    // Reject if price changed by more than MAX_CHANGE_FACTOR
    const inputRatio = newPrices.input_price / model.input_price;
    const outputRatio = newPrices.output_price / model.output_price;

    if (inputRatio > MAX_CHANGE_FACTOR || inputRatio < 1 / MAX_CHANGE_FACTOR) {
        return `Input price change too large: $${model.input_price} → $${newPrices.input_price} (${inputRatio.toFixed(1)}x)`;
    }
    if (outputRatio > MAX_CHANGE_FACTOR || outputRatio < 1 / MAX_CHANGE_FACTOR) {
        return `Output price change too large: $${model.output_price} → $${newPrices.output_price} (${outputRatio.toFixed(1)}x)`;
    }
    return null;
}

function saveHistorySnapshot(models) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const file = path.join(HISTORY_DIR, `${month}.json`);

    const snapshot = {
        date: now.toISOString().split('T')[0],
        models: models.map(m => ({
            id: m.id,
            input_price: m.input_price,
            output_price: m.output_price
        }))
    };

    if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`\nHistory snapshot saved: ${file}`);
}

async function main() {
    console.log('TKN Price Index — AI Pricing Scraper');
    console.log('=====================================');
    if (DRY_RUN) console.log('(DRY RUN — no files will be modified)\n');

    const models = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf-8'));
    const changes = [];
    const warnings = [];

    for (const config of SCRAPE_CONFIGS) {
        const prices = await scrapeProvider(config);

        for (const [modelId, newPrices] of Object.entries(prices)) {
            const model = models.find(m => m.id === modelId);
            if (!model) {
                warnings.push(`Unknown model: ${modelId}`);
                continue;
            }

            if (model.input_price === newPrices.input_price && model.output_price === newPrices.output_price) {
                continue; // No change
            }

            // Validate — reject suspicious changes
            const issue = validateChange(model, newPrices);
            if (issue) {
                warnings.push(`${model.name}: ${issue} — SKIPPED`);
                continue;
            }

            changes.push({
                id: modelId,
                name: model.name,
                old_input: model.input_price,
                new_input: newPrices.input_price,
                old_output: model.output_price,
                new_output: newPrices.output_price
            });

            if (!DRY_RUN) {
                model.input_price = newPrices.input_price;
                model.output_price = newPrices.output_price;
            }
        }
    }

    // Report
    console.log('\n=====================================');

    if (warnings.length > 0) {
        console.log(`\n⚠ ${warnings.length} warning(s):`);
        for (const w of warnings) console.log(`  ${w}`);
    }

    if (changes.length === 0) {
        console.log('\nNo price changes applied.');
    } else {
        console.log(`\n${changes.length} price change(s) applied:\n`);
        for (const c of changes) {
            console.log(`  ${c.name}:`);
            if (c.old_input !== c.new_input) {
                console.log(`    Input:  $${c.old_input} → $${c.new_input}`);
            }
            if (c.old_output !== c.new_output) {
                console.log(`    Output: $${c.old_output} → $${c.new_output}`);
            }
        }

        if (!DRY_RUN) {
            fs.writeFileSync(MODELS_PATH, JSON.stringify(models, null, 2) + '\n');
            console.log(`\nUpdated ${MODELS_PATH}`);
            saveHistorySnapshot(models);
        }
    }

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `changes=${changes.length}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `warnings=${warnings.length}\n`);
        if (changes.length > 0) {
            const summary = changes.map(c => c.name).join(', ');
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `summary=${summary}\n`);
        }
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
