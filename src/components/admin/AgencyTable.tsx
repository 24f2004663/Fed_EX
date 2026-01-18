"use client";
// Force refresh

import { useEffect, useState } from "react";
import { Agency, AgencyPerformance } from "@prisma/client";
import { Badge } from "@/components/Badge"; // Assuming we have Badge, or I'll implement simple span
import { Edit2, Trash2, Shield, TrendingUp } from "lucide-react";
import { deleteAgencyAdmin } from "@/app/admin/actions";
import { useRouter } from "next/navigation";

// Extended type to include performance
type AgencyWithPerf = Agency & { performance: AgencyPerformance[] };

interface AgencyTableProps {
    agencies: AgencyWithPerf[];
    onEdit: (agency: AgencyWithPerf) => void;
}

export function AgencyTable({ agencies, onEdit }: AgencyTableProps) {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to PERMANENTLY DELETE "${name}"?\n\nThis will:\n1. Delete the agency record.\n2. Delete all performance history.\n3. Unlink all associated users.`)) return;

        setIsDeleting(id);
        const res = await deleteAgencyAdmin(id);
        setIsDeleting(null);

        if (!res.success) {
            alert(res.error);
        } else {
            router.refresh(); // Refresh stored data
        }
    };

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="p-4 font-semibold text-gray-500">Agency Name</th>
                        <th className="p-4 font-semibold text-gray-500">Region</th>
                        <th className="p-4 font-semibold text-gray-500">Status</th>
                        <th className="p-4 font-semibold text-gray-500">Capacity</th>
                        <th className="p-4 font-semibold text-gray-500">Current Score</th>
                        <th className="p-4 font-semibold text-gray-500 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {agencies.length === 0 && (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-400 italic">No agencies found.</td>
                        </tr>
                    )}
                    {agencies.map((agency) => {
                        const latestPerf = agency.performance[0];
                        const score = latestPerf?.recoveryRate || 0; // Use recovery rate as proxy for score
                        const isInactive = agency.status === 'INACTIVE';

                        return (
                            <tr key={agency.id} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="p-4 font-medium text-[var(--color-primary-dark)]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs ring-2 ring-indigo-50">
                                            {agency.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        {agency.name}
                                    </div>
                                </td>
                                <td className="p-4 text-gray-600">{agency.region}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${isInactive ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                        {agency.status}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-1 font-mono text-gray-600">
                                        <Shield className="w-3 h-3 text-gray-400" />
                                        {agency.capacity}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                                style={{ width: `${score}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-gray-700">{score}%</span>
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => onEdit(agency)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-200"
                                            title="Edit / View History"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(agency.id, agency.name)}
                                            disabled={!!isDeleting}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-red-200"
                                            title="Delete Agency Permanently"
                                        >
                                            {isDeleting === agency.id ? '...' : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
