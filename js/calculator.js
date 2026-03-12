document.addEventListener('alpine:init', () => {
    Alpine.data('calculator', () => ({
        inputTokens: 1000000,
        outputTokens: 500000,
        inputSlider: 60,
        outputSlider: 57,

        init() {
            this.$watch('inputSlider', val => {
                this.inputTokens = this.sliderToTokens(val);
            });
            this.$watch('outputSlider', val => {
                this.outputTokens = this.sliderToTokens(val);
            });
        },

        sliderToTokens(val) {
            // Logarithmic: 0=10K, 25=100K, 50=1M, 75=10M, 100=100M
            const exp = 4 + (val / 100) * 3; // 4 to 7
            return Math.round(Math.pow(10, exp));
        },

        tokensToSlider(tokens) {
            if (tokens <= 0) return 0;
            const exp = Math.log10(tokens);
            return Math.round(((exp - 4) / 3) * 100);
        },

        formatTokens(n) {
            if (n >= 1000000000) return (n / 1000000000).toFixed(1) + 'B';
            if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
            if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
            return n.toString();
        },

        get results() {
            const models = Alpine.raw(this.$data.$root._x_dataStack?.[0]?.models) ||
                           window._priceIndexModels || [];
            if (!models.length) return [];

            const results = models.map(m => {
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
