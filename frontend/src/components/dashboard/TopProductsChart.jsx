import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import './Charts.css';

export default function TopProductsChart({ data }) {
    return (
        <div className="chart-card">
            <h3>Top Products</h3>
            <div className="chart-container" role="img" aria-label="Bar chart showing top products">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={true} vertical={false} />
                        <XAxis type="number" stroke="#888" tickLine={false} axisLine={false} />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={120}
                            stroke="#888"
                            style={{ fontSize: '12px' }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <RechartsTooltip
                            contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        />
                        <Bar
                            dataKey="quantity_sold"
                            fill="#388bfd"
                            radius={[0, 4, 4, 0]}
                            barSize={20}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
