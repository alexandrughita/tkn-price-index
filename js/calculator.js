document.addEventListener('alpine:init', () => {
    Alpine.data('calculator', () => ({
        models: [],
        providers: [],
        inputTokens: 1000000,
        outputTokens: 500000,
        inputSlider: 60,
        outputSlider: 57,
        loading: true,

        async init() {
            const [providers, models] = await Promise.all([
                fetch('data/providers.json').then(r => r.json()).catch(() => []),
                fetch('data/models.json').then(r => r.json()).catch(() => [])
            ]);
            this.providers = providers;
            this.models = models;
            this.loading = false;

            this.$watch('inputSlider', val => {
                this.inputTokens = this.sliderToTokens(val);
            });
            this.$watch('outputSlider', val => {
                this.outputTokens = this.sliderToTokens(val);
            });
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

        providerColor(id) {
            return this.providers.find(p => p.id === id)?.color || '#666';
        },

        get results() {
            if (!this.models.length) return [];

            const results = this.models.map(m => {
                const monthlyCost = (this.inputTokens / 1000000) * m.input_price +
                                    (this.outputTokens / 1000000) * m.output_price;
                return { ...m, monthlyCost };
            }).sort((a, b) => a.monthlyCost - b.monthlyCost);

            const maxCost = results[results.length - 1]?.monthlyCost || 1;

            return results.map(m => ({
                ...m,
                annualCost: m.monthlyCost * 12,
                savingsVsMax: maxCost - m.monthlyCost,
                savingsPercent: maxCost > 0 ? ((1 - m.monthlyCost / maxCost) * 100).toFixed(0) : 0,
                barWidth: maxCost > 0 ? (m.monthlyCost / maxCost * 100) : 0
            }));
        }
    }));
});
