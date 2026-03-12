document.addEventListener('alpine:init', () => {
    Alpine.data('trends', () => ({
        chart: null,
        chartType: 'input',
        historyFiles: ['2026-03'],
        historyData: [],
        loading: true,

        async init() {
            await this.loadHistory();
            this.loading = false;
            this.$watch('chartType', () => this.renderChart());
        },

        async loadHistory() {
            const promises = this.historyFiles.map(f =>
                fetch(`data/history/${f}.json`).then(r => r.json()).catch(() => null)
            );
            this.historyData = (await Promise.all(promises)).filter(Boolean);
        },

        renderChart() {
            const canvas = document.getElementById('priceChart');
            if (!canvas) return;

            if (this.chart) this.chart.destroy();

            const models = window._priceIndexModels || [];
            const providers = window._priceIndexProviders || [];

            const priceKey = this.chartType === 'input' ? 'input_price' : 'output_price';

            // Group models by provider
            const datasets = providers.map(provider => {
                const providerModels = models.filter(m => m.provider === provider.id && m.tier === 'flagship');
                if (!providerModels.length) return null;

                const model = providerModels[0];
                const data = this.historyData.map(snapshot => {
                    const entry = snapshot.prices.find(p => p.model_id === model.id);
                    return entry ? entry[priceKey] : null;
                });

                return {
                    label: model.name,
                    data: data,
                    borderColor: provider.color,
                    backgroundColor: provider.color + '33',
                    tension: 0.3,
                    pointRadius: 6,
                    pointHoverRadius: 8
                };
            }).filter(Boolean);

            const labels = this.historyData.map(s => s.snapshot_date);

            this.chart = new Chart(canvas, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#9CA3AF', font: { size: 13 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)} / 1M tokens`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#6B7280' },
                            grid: { color: '#1F2937' }
                        },
                        y: {
                            ticks: {
                                color: '#6B7280',
                                callback: val => '$' + val.toFixed(2)
                            },
                            grid: { color: '#1F2937' },
                            title: {
                                display: true,
                                text: 'Price per 1M tokens',
                                color: '#6B7280'
                            }
                        }
                    }
                }
            });
        }
    }));
});
