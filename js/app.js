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

        async init() {
            const [providers, models] = await Promise.all([
                fetch('data/providers.json').then(r => r.json()),
                fetch('data/models.json').then(r => r.json())
            ]);
            this.providers = providers;
            this.models = models;
            this.loading = false;
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
            result.sort((a, b) => {
                if (hp) {
                    const aH = a.provider === hp ? 0 : 1;
                    const bH = b.provider === hp ? 0 : 1;
                    if (aH !== bH) return aH - bH;
                }
                const aVal = a[this.sortBy] ?? 0;
                const bVal = b[this.sortBy] ?? 0;
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
            if (price < 0.10) return '$' + price.toFixed(3);
            return '$' + price.toFixed(2);
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
