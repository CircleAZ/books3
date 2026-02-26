import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { useCurrency } from '../../context/CurrencyContext';
import './Charts.css';

export default function SalesTrendChart({ data }) {
    const { currency } = useCurrency();
    return (
        <div className="chart-card">
            <h3>Sales Trend (Last 7 Days)</h3>
            <div className="chart-container" role="img" aria-label="Line chart showing sales trend">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke="#888"
                            tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#888"
                            tick={{ fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => `${currency}${val}`}
                        />
                        <RechartsTooltip
                            contentStyle={{ backgroundColor: '#1e2332', borderColor: '#333', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value) => [`${currency}${value}`, 'Sales']}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#40cdba"
                            strokeWidth={3}
                            dot={{ r: 4, fill: '#40cdba', strokeWidth: 2, stroke: '#fff' }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
