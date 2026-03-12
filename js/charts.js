document.addEventListener('alpine:init', () => {
    Alpine.data('trends', () => ({
        chart: null,
        chartType: 'input',
        providers: [],
        models: [],
        historyData: [],

        async init() {
            const history = await fetch('data/history/2026-03.json').then(r => r.json()).catch(() => null);
            this.historyData = history ? [history] : [];

            this.syncFromParent();
            window.addEventListener('tkn-data-changed', () => {
                this.syncFromParent();
                this.renderChart();
            });

            this.$nextTick(() => this.renderChart());
            this.$watch('chartType', () => this.renderChart());
        },

        syncFromParent() {
            if (window._tknModels) this.models = [...window._tknModels];
            if (window._tknProviders) this.providers = [...window._tknProviders];
        },

        renderChart() {
            const canvas = document.getElementById('priceChart');
            if (!canvas || !this.models.length) return;

            if (this.chart) this.chart.destroy();

            const priceKey = this.chartType === 'input' ? 'input_price' : 'output_price';

            // Get flagship models (AI) + attention tier (videochat), one per provider
            const entries = this.providers.map(provider => {
                const model = this.models.find(m =>
                    m.provider === provider.id && (m.tier === 'flagship' || m.tier === 'attention')
                );
                return model ? { ...model, color: provider.color } : null;
            }).filter(Boolean);

            entries.sort((a, b) => a[priceKey] - b[priceKey]);

            this.chart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: entries.map(f => f.name),
                    datasets: [{
                        label: this.chartType === 'input' ? 'Input / Buy price ($/1M tokens)' : 'Output / Payout price ($/1M tokens)',
                        data: entries.map(f => f[priceKey]),
                        backgroundColor: entries.map(f => f.color + '99'),
                        borderColor: entries.map(f => f.color),
                        borderWidth: 2,
                        borderRadius: 6,
                        barPercentage: 0.6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => {
                                    const val = ctx.parsed.x;
                                    if (val >= 1000) return '$' + val.toLocaleString() + ' per 1M tokens';
                                    return '$' + val.toFixed(2) + ' per 1M tokens';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            type: 'logarithmic',
                            ticks: {
                                color: '#6B7280',
                                callback: val => {
                                    if (val >= 1000) return '$' + (val/1000).toFixed(0) + 'K';
                                    return '$' + val;
                                },
                                font: { family: 'JetBrains Mono, monospace', size: 12 }
                            },
                            grid: { color: '#1F2937' },
                            title: {
                                display: true,
                                text: 'Price per 1M tokens (log scale)',
                                color: '#6B7280'
                            }
                        },
                        y: {
                            ticks: {
                                color: '#E5E7EB',
                                font: { size: 12 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }));
});
