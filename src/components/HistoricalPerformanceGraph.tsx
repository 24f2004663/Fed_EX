'use client';

import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Line,
    ComposedChart,
    Bar,
    Legend
} from 'recharts';
import { Card } from './Card';

const data = [
    { name: 'Jan', successRate: 65, threshold: 70, volume: 4000 },
    { name: 'Feb', successRate: 68, threshold: 70, volume: 3000 },
    { name: 'Mar', successRate: 72, threshold: 72, volume: 2000 },
    { name: 'Apr', successRate: 70, threshold: 72, volume: 2780 },
    { name: 'May', successRate: 75, threshold: 72, volume: 1890 },
    { name: 'Jun', successRate: 78, threshold: 75, volume: 2390 },
    { name: 'Jul', successRate: 82, threshold: 75, volume: 3490 },
    { name: 'Aug', successRate: 80, threshold: 75, volume: 4000 },
    { name: 'Sep', successRate: 85, threshold: 78, volume: 3000 },
    { name: 'Oct', successRate: 88, threshold: 78, volume: 2000 },
    { name: 'Nov', successRate: 87, threshold: 78, volume: 3490 },
    { name: 'Dec', successRate: 90, threshold: 80, volume: 4000 },
];

export function HistoricalPerformanceGraph() {
    return (
        <Card className="w-full h-[500px]">
            <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-800">Historical Performance (Last Year)</h2>
                <p className="text-sm text-gray-500">Agency Success Rate vs Model Threshold & Volume</p>
            </div>

            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        data={data}
                        margin={{
                            top: 20,
                            right: 20,
                            bottom: 20,
                            left: 20,
                        }}
                    >
                        <CartesianGrid stroke="#f5f5f5" />
                        <XAxis dataKey="name" scale="point" padding={{ left: 10, right: 10 }} />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" label={{ value: 'Success %', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" label={{ value: 'Volume ($)', angle: 90, position: 'insideRight' }} />
                        <Tooltip />
                        <Legend />

                        {/* Volume (Area) */}
                        <Area yAxisId="right" type="monotone" dataKey="volume" fill="#e0e7ff" stroke="#8884d8" name="Recovery Volume ($)" />

                        {/* Success Rate (Bar) */}
                        <Bar yAxisId="left" dataKey="successRate" barSize={20} fill="#4ade80" name="Success Rate (%)" radius={[4, 4, 0, 0]} />

                        {/* Model Threshold (Line) */}
                        <Line yAxisId="left" type="monotone" dataKey="threshold" stroke="#ff7300" strokeWidth={3} dot={{ r: 4 }} name="AI Model Threshold" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
