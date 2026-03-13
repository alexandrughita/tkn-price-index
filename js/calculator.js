document.addEventListener('alpine:init', () => {
    Alpine.data('calculator', () => ({
        models: [],
        providers: [],
        highlightProvider: null,
        inputTokens: 1000000,
        outputTokens: 500000,
        inputSlider: 60,
        outputSlider: 57,
        currencyRate: 1,
        currencySymbol: '$',
        currencyId: 'USD',

        init() {
            this.syncFromParent();
            this.syncCurrency();
            window.addEventListener('tkn-data-changed', () => this.syncFromParent());
            window.addEventListener('tkn-currency-changed', () => this.syncCurrency());

            this.$watch('inputSlider', val => {
                this.inputTokens = this.sliderToTokens(val);
            });
            this.$watch('outputSlider', val => {
                this.outputTokens = this.sliderToTokens(val);
            });
        },

        syncFromParent() {
            if (window._tknModels) this.models = [...window._tknModels];
            if (window._tknProviders) this.providers = [...window._tknProviders];
        },

        syncCurrency() {
            const c = window._tknCurrency;
            if (c) {
                this.currencyRate = c.rate;
                this.currencySymbol = c.symbol;
                this.currencyId = c.id;
            }
        },

        formatCost(usd) {
            const val = usd * this.currencyRate;
            if (this.currencyId === 'BTC') return this.currencySymbol + val.toFixed(6);
            return this.currencySymbol + val.toFixed(2);
        },

        sliderToTokens(val) {
            const exp = 4 + (val / 100) * 3;
            return Math.round(Math.pow(10, exp));
        },

        formatTokens(n) {
            if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'B';
            if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
            if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
            return n.toString();
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

        get results() {
            if (!this.models.length) return [];

            // Filter out attention-tier models from cost calc (different unit)
            const aiModels = this.models.filter(m => m.tier !== 'attention');

            const hp = this.highlightProvider;
            const results = aiModels.map(m => {
                const monthlyCost = (this.inputTokens / 1000000) * m.input_price +
                                    (this.outputTokens / 1000000) * m.output_price;
                return { ...m, monthlyCost };
            }).sort((a, b) => {
                if (hp) {
                    const aH = a.provider === hp ? 0 : 1;
                    const bH = b.provider === hp ? 0 : 1;
                    if (aH !== bH) return aH - bH;
                }
                return a.monthlyCost - b.monthlyCost;
            });

            const maxCost = results[results.length - 1]?.monthlyCost || 1;

            return results.map(m => ({
                ...m,
                annualCost: m.monthlyCost * 12,
                savingsVsMax: maxCost - m.monthlyCost,
                savingsPercent: maxCost > 0 ? ((1 - m.monthlyCost / maxCost) * 100).toFixed(0) : 0,
                barWidth: maxCost > 0 ? (m.monthlyCost / maxCost * 100) : 0
            }));
        },

        get attentionResults() {
            const attentionModels = this.models.filter(m => m.tier === 'attention');
            if (!attentionModels.length) return [];

            // For attention tokens: cost of buying X tokens
            const tokenCount = this.inputTokens;
            return attentionModels.map(m => ({
                ...m,
                totalCost: tokenCount * (m.input_price / 1000000),
                performerEarns: tokenCount * (m.output_price / 1000000)
            })).sort((a, b) => a.totalCost - b.totalCost);
        }
    }));
});
