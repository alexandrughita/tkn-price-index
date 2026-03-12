document.addEventListener('alpine:init', () => {
    Alpine.data('priceIndex', () => ({
        providers: [],
        models: [],
        nsfwProviders: [],
        nsfwModels: [],
        nsfwActive: false,
        sortBy: 'input_price',
        sortAsc: true,
        highlightProvider: null,
        filterTier: 'all',
        search: '',
        tab: 'table',
        loading: true,
        currency: 'USD',
        currencyRate: 1,
        currencies: [
            { id: 'USD', symbol: '$', rate: 1 },
            { id: 'EUR', symbol: '\u20AC', rate: 0.92 },
            { id: 'GBP', symbol: '\u00A3', rate: 0.79 },
            { id: 'BTC', symbol: '\u20BF', rate: null }
        ],

        async init() {
            const [providers, models] = await Promise.all([
                fetch('data/providers.json').then(r => r.json()),
                fetch('data/models.json').then(r => r.json())
            ]);
            this.providers = providers;
            this.models = models;
            this.loading = false;
            this.syncSharedData();
            this.fetchBtcRate();
        },

        async fetchBtcRate() {
            try {
                const res = await fetch('https://api.coindesk.com/v1/bpi/currentprice/USD.json');
                const data = await res.json();
                const btcUsd = data.bpi.USD.rate_float;
                const btc = this.currencies.find(c => c.id === 'BTC');
                if (btc) btc.rate = 1 / btcUsd;
            } catch (e) {
                const btc = this.currencies.find(c => c.id === 'BTC');
                if (btc) btc.rate = 1 / 85000;
            }
        },

        setCurrency(id) {
            this.currency = id;
            const c = this.currencies.find(c => c.id === id);
            this.currencyRate = c?.rate || 1;
            window._tknCurrency = { id, rate: this.currencyRate, symbol: c?.symbol || '$' };
            window.dispatchEvent(new CustomEvent('tkn-currency-changed'));
        },

        get currencySymbol() {
            return this.currencies.find(c => c.id === this.currency)?.symbol || '$';
        },

        syncSharedData() {
            window._tknModels = this.models;
            window._tknProviders = this.providers;
            window._tknNsfw = this.nsfwActive;
            window.dispatchEvent(new CustomEvent('tkn-data-changed'));
        },

        async toggleNsfw() {
            if (!this.nsfwModels.length) {
                const data = await fetch('data/videochat.json').then(r => r.json());
                this.nsfwProviders = data.providers;
                this.nsfwModels = data.models;
            }

            this.nsfwActive = !this.nsfwActive;

            if (this.nsfwActive) {
                // Add videochat providers and models
                this.nsfwProviders.forEach(p => {
                    if (!this.providers.find(ep => ep.id === p.id)) {
                        this.providers.push(p);
                    }
                });
                this.nsfwModels.forEach(m => {
                    if (!this.models.find(em => em.id === m.id)) {
                        // Normalize: videochat tokens map buy_price as "input" and payout as "output"
                        this.models.push({
                            ...m,
                            input_price: m.buy_price_per_token * 1000000,
                            output_price: m.payout_per_token * 1000000,
                            context_window: null,
                            max_output: null,
                            supports_vision: true,
                            supports_tools: false,
                            reasoning: false
                        });
                    }
                });
            } else {
                // Remove videochat data
                const nsfwIds = this.nsfwProviders.map(p => p.id);
                this.providers = this.providers.filter(p => !nsfwIds.includes(p.id));
                this.models = this.models.filter(m => !nsfwIds.includes(m.provider));
                if (nsfwIds.includes(this.highlightProvider)) this.highlightProvider = null;
            }
            this.syncSharedData();
        },

        get allProviders() {
            return this.providers;
        },

        get filteredModels() {
            let result = this.models
                .filter(m => this.filterTier === 'all' || m.tier === this.filterTier)
                .filter(m => !this.search || m.name.toLowerCase().includes(this.search.toLowerCase()));

            // Sort: highlighted provider first, then by sort column
            const hp = this.highlightProvider;
            const speedOrder = { fast: 1, medium: 2, slow: 3 };
            result.sort((a, b) => {
                if (hp) {
                    const aH = a.provider === hp ? 0 : 1;
                    const bH = b.provider === hp ? 0 : 1;
                    if (aH !== bH) return aH - bH;
                }
                let aVal = a[this.sortBy] ?? 0;
                let bVal = b[this.sortBy] ?? 0;
                if (this.sortBy === 'speed') {
                    aVal = speedOrder[aVal] ?? 99;
                    bVal = speedOrder[bVal] ?? 99;
                }
                if (typeof aVal === 'string') {
                    return this.sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return this.sortAsc ? aVal - bVal : bVal - aVal;
            });

            return result;
        },

        isHighlighted(model) {
            return !this.highlightProvider || model.provider === this.highlightProvider;
        },

        get minInput() {
            const prices = this.filteredModels.map(m => m.input_price);
            return Math.min(...prices);
        },

        get minOutput() {
            const prices = this.filteredModels.map(m => m.output_price);
            return Math.min(...prices);
        },

        toggleSort(col) {
            if (this.sortBy === col) {
                this.sortAsc = !this.sortAsc;
            } else {
                this.sortBy = col;
                this.sortAsc = true;
            }
        },

        toggleProvider(id) {
            this.highlightProvider = this.highlightProvider === id ? null : id;
        },

        isProviderActive(id) {
            return this.highlightProvider === id;
        },

        providerColor(id) {
            return this.providers.find(p => p.id === id)?.color || '#666';
        },

        providerName(id) {
            return this.providers.find(p => p.id === id)?.display_name || id;
        },

        isAttentionTier(model) {
            return model.tier === 'attention';
        },

        formatPrice(price) {
            if (price === null || price === undefined) return '\u2014';
            const converted = price * this.currencyRate;
            const sym = this.currencySymbol;
            if (this.currency === 'BTC') {
                return sym + converted.toFixed(8);
            }
            if (converted < 0.10) return sym + converted.toFixed(3);
            return sym + converted.toFixed(2);
        },

        formatContext(tokens) {
            if (!tokens) return '\u2014';
            if (tokens >= 1000000) return (tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1) + 'M';
            return (tokens / 1000).toFixed(0) + 'K';
        },

        sortIcon(col) {
            if (this.sortBy !== col) return '\u2195';
            return this.sortAsc ? '\u2191' : '\u2193';
        },

        tierLabel(tier) {
            return { flagship: 'Flagship', balanced: 'Balanced', budget: 'Budget', attention: 'Attention' }[tier] || tier;
        },

        tierColor(tier) {
            return {
                flagship: 'bg-amber-500/20 text-amber-400',
                balanced: 'bg-blue-500/20 text-blue-400',
                budget: 'bg-green-500/20 text-green-400',
                attention: 'bg-pink-500/20 text-pink-400'
            }[tier] || 'bg-gray-500/20 text-gray-400';
        }
    }));
});
