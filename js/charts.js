document.addEventListener('alpine:init', () => {
    Alpine.data('trends', () => ({
        chart: null,
        chartType: 'input',
        providers: [],
        models: [],
        historyData: [],
        loading: true,

        async init() {
            const [providers, models, history] = await Promise.all([
                fetch('data/providers.json').then(r => r.json()).catch(() => []),
                fetch('data/models.json').then(r => r.json()).catch(() => []),
                fetch('data/history/2026-03.json').then(r => r.json()).catch(() => null)
            ]);
            this.providers = providers;
            this.models = models;
            this.historyData = history ? [history] : [];
            this.loading = false;
            this.$nextTick(() => this.renderChart());
            this.$watch('chartType', () => this.renderChart());
        },

        renderChart() {
            const canvas = document.getElementById('priceChart');
            if (!canvas || !this.models.length) return;

            if (this.chart) this.chart.destroy();

            const priceKey = this.chartType === 'input' ? 'input_price' : 'output_price';

            // Get flagship models, one per provider
            const flagships = this.providers.map(provider => {
                const model = this.models.find(m => m.provider === provider.id && m.tier === 'flagship');
                return model ? { ...model, color: provider.color, providerName: provider.display_name } : null;
            }).filter(Boolean);

            // Sort by price ascending
            flagships.sort((a, b) => a[priceKey] - b[priceKey]);

            this.chart = new Chart(canvas, {
                type: 'bar',
                data: {
                    labels: flagships.map(f => f.name),
                    datasets: [{
                        label: this.chartType === 'input' ? 'Input price ($/1M tokens)' : 'Output price ($/1M tokens)',
                        data: flagships.map(f => f[priceKey]),
                        backgroundColor: flagships.map(f => f.color + '99'),
                        borderColor: flagships.map(f => f.color),
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
                                label: ctx => `$${ctx.parsed.x.toFixed(2)} per 1M tokens`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#6B7280',
                                callback: val => '$' + val.toFixed(2),
                                font: { family: 'JetBrains Mono, monospace', size: 12 }
                            },
                            grid: { color: '#1F2937' },
                            title: {
                                display: true,
                                text: 'Price per 1M tokens',
                                color: '#6B7280'
                            }
                        },
                        y: {
                            ticks: {
                                color: '#E5E7EB',
                                font: { size: 13 }
                            },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }));
});
