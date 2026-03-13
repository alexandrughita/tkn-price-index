document.addEventListener('alpine:init', () => {
    Alpine.data('archive', () => ({
        chart: null,
        archiveData: null,
        showBudget: false,

        async init() {
            this.archiveData = await fetch('data/archive.json').then(r => r.json()).catch(() => null);
            this.$nextTick(() => this.renderChart());
            this.$watch('showBudget', () => this.renderChart());
        },

        renderChart() {
            const canvas = document.getElementById('archiveChart');
            if (!canvas || !this.archiveData) return;

            if (this.chart) this.chart.destroy();

            const series = this.archiveData.series.filter(s => {
                if (!this.showBudget && s.provider.includes('-budget')) return false;
                return true;
            });

            // Build unified time axis from all data points
            const allDates = new Set();
            series.forEach(s => s.points.forEach(p => allDates.add(p.date)));
            const dates = [...allDates].sort();

            const datasets = series.map(s => {
                const data = dates.map(date => {
                    // Find the most recent price at or before this date
                    let lastPoint = null;
                    for (const p of s.points) {
                        if (p.date <= date) lastPoint = p;
                    }
                    // Don't extrapolate before the first data point
                    if (!lastPoint) return null;
                    // Don't extrapolate after the last data point
                    const lastKnown = s.points[s.points.length - 1];
                    if (date > lastKnown.date) return null;
                    return lastPoint.price;
                });

                const isBudget = s.provider.includes('-budget');

                return {
                    label: s.label,
                    data: data,
                    borderColor: s.color,
                    backgroundColor: s.color + '20',
                    borderWidth: isBudget ? 1 : 2,
                    borderDash: isBudget ? [4, 4] : [],
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    pointBackgroundColor: s.color,
                    pointBorderColor: s.color,
                    tension: 0.3,
                    spanGaps: true,
                    fill: false
                };
            });

            // Format dates for display
            const labels = dates.map(d => {
                const [y, m] = d.split('-');
                const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return months[parseInt(m)] + ' ' + y.slice(2);
            });

            this.chart = new Chart(canvas, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#6B7280',
                                font: { size: 11, family: 'Inter, sans-serif' },
                                padding: 16,
                                usePointStyle: true,
                                pointStyleWidth: 8
                            }
                        },
                        tooltip: {
                            backgroundColor: '#111827',
                            borderColor: '#1F2937',
                            borderWidth: 1,
                            titleColor: '#9CA3AF',
                            bodyColor: '#E5E7EB',
                            titleFont: { size: 11 },
                            bodyFont: { size: 12, family: 'JetBrains Mono, monospace' },
                            padding: 10,
                            callbacks: {
                                label: ctx => {
                                    if (ctx.parsed.y === null) return null;
                                    const series = this.archiveData.series[ctx.datasetIndex];
                                    // Find the model name for this date
                                    const date = dates[ctx.dataIndex];
                                    let model = '';
                                    for (const p of series.points) {
                                        if (p.date <= date) model = p.model;
                                    }
                                    return `${series.label}: $${ctx.parsed.y.toFixed(2)} – ${model}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#4B5563',
                                font: { size: 11, family: 'JetBrains Mono, monospace' },
                                maxRotation: 45
                            },
                            grid: { color: '#111827' }
                        },
                        y: {
                            type: 'logarithmic',
                            ticks: {
                                color: '#4B5563',
                                font: { size: 11, family: 'JetBrains Mono, monospace' },
                                callback: val => {
                                    if (val >= 1) return '$' + val;
                                    return '$' + val.toFixed(2);
                                }
                            },
                            grid: { color: '#111827' },
                            title: {
                                display: true,
                                text: 'Input price $/1M tokens (log)',
                                color: '#4B5563',
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }
    }));
});
