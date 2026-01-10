'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { Card } from './Card';
import { Badge } from './Badge';

interface Props {
    agencyId: string;
    currentScore: number; // 0-100
    history?: number[]; // Performance History
}

export function AgencyCapacityAnalysis({ agencyId, currentScore, history }: Props) {
    // 1. Logic for Thresholds
    // "collection threshold: alpha = 4, beta = 5, gamma = 3"
    // Default to 1 if new (score 0), else 3
    let baseCapacity = currentScore > 0 ? 3 : 1;

    if (agencyId === 'user-agency-alpha') baseCapacity = 4;
    else if (agencyId === 'user-agency-beta') baseCapacity = 5;
    else if (agencyId === 'user-agency-gamma') baseCapacity = 3;

    // "HP Threshold Logic"
    // > 80% -> 50-75% of threshold
    // 50-80% -> 30-40% of threshold
    // < 50% -> Rarely (0)
    let hpLimit = 0;
    let hpReason = "Low Performance (<50%)";

    if (currentScore >= 80) {
        // Example: 75% of Capacity
        hpLimit = Math.floor(baseCapacity * 0.75);
        hpReason = "High Performance (>80%)";
    } else if (currentScore >= 50) {
        // Example: 40% of Capacity
        hpLimit = Math.floor(baseCapacity * 0.40);
        hpReason = "Moderate Performance (50-80%)";
    }

    // 2. Mock or Real Historical Data
    const data = [];
    // If history prop is provided, use it
    if (history && history.length > 0) {
        for (let i = 0; i < history.length; i++) {
            const date = new Date();
            // date.setMonth(date.getMonth() - (history.length - 1 - i));
            // Assuming history is [oldest ... newest]
            // Actually, usually mocks are generated backwards. 
            // Let's assume history[last] is current.

            // Let's generate labels based on index relative to now
            const offset = history.length - 1 - i;
            date.setMonth(date.getMonth() - offset);
            const monthName = date.toLocaleString('default', { month: 'short' });

            data.push({
                name: monthName,
                score: history[i]
            });
        }
    } else {
        // Fallback Mock (should not happen if store is correct)
        for (let i = 11; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthName = date.toLocaleString('default', { month: 'short' });

            // Random variance but trending towards currentScore
            const variance = Math.random() * 10 - 5;
            const yearTrend = currentScore - (i * 2);

            data.push({
                name: monthName,
                score: Math.min(100, Math.max(0, Math.floor(yearTrend + variance)))
            });
        }
    }

    return (
        <Card className="mb-8 border-t-4 border-t-[var(--color-primary)]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Visual Graph */}
                <div className="md:col-span-2 h-64 flex flex-col">
                    <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wide">12-Month Performance Trend</h3>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                                <YAxis domain={[0, 100]} hide />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                />
                                <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Excellent (80%)', fill: '#22c55e', fontSize: 10 }} />
                                <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke="var(--color-primary)"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: 'var(--color-primary)', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Derived Metrics Panel */}
                <div className="flex flex-col justify-center space-y-6 bg-gray-50 p-6 rounded-xl border border-gray-100">
                    <div>
                        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Calculated Capacity</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-gray-900">{baseCapacity}</span>
                            <span className="text-sm text-gray-500">Allocations / Batch</span>
                        </div>
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            Based on consistent performance
                        </p>
                    </div>

                    <div className="border-t border-gray-200 pt-4">
                        <p className="text-xs text-gray-500 font-semibold uppercase mb-1">High Priority Allowance</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold text-[var(--color-primary)]">{hpLimit}</span>
                            <span className="text-sm text-gray-500">Max High Priority</span>
                        </div>
                        <Badge variant="info" className="mt-2 text-xs">
                            {hpReason}
                        </Badge>
                    </div>
                </div>
            </div>
        </Card>
    );
}
