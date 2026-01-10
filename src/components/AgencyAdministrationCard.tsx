"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/Card";
import { Plus, Save, Trash2, RotateCcw, Upload } from "lucide-react";
import { getAgenciesAction, addAgencyAction, removeAgencyAction, resetAgenciesAction, uploadAgencyDataAction } from "@/app/agency/actions";

interface Agency {
    id: string;
    name: string;
    score: number;
}

export const AgencyAdministrationCard = () => {
    const [isEditing, setIsEditing] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newAgencyName, setNewAgencyName] = useState("");
    const [agencies, setAgencies] = useState<Agency[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch initial data
    useEffect(() => {
        loadAgencies();
    }, []);

    const loadAgencies = async () => {
        setIsLoading(true);
        try {
            const data = await getAgenciesAction();
            // Map store data (which might have color/history) to simple interface
            setAgencies(data.map((a: any) => ({ id: a.id, name: a.name, score: a.score })));
        } catch (e) {
            console.error("Failed to load agencies", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpload = (agencyId: string) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.md,.log,.csv,.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            setIsLoading(true);
            try {
                const formData = new FormData();
                formData.append('agencyId', agencyId);
                formData.append('file', file);

                const result = await uploadAgencyDataAction(formData);

                if (result.success) {
                    alert(`✅ Analysis Complete!\n\n${result.details || 'Agency updated.'}`);
                    loadAgencies(); // Refresh data
                } else {
                    alert('❌ Analysis Failed: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Error uploading file.');
            } finally {
                setIsLoading(false);
            }
        };
        input.click();
    };

    const handleModify = () => {
        setIsEditing(true);
    };

    const handleSave = () => {
        setIsEditing(false);
        setIsAdding(false);
    };

    const handleReset = async () => {
        if (confirm("Are you sure you want to reset to default agencies? all changes will be lost.")) {
            await resetAgenciesAction();
            loadAgencies();
        }
    }

    const handleRemove = async (id: string) => {
        // Optimistic update
        setAgencies(agencies.filter((a) => a.id !== id));
        await removeAgencyAction(id);
    };

    const startAdd = () => {
        setIsAdding(true);
        setNewAgencyName("");
    }

    const cancelAdd = () => {
        setIsAdding(false);
        setNewAgencyName("");
    }

    const confirmAdd = async () => {
        if (!newAgencyName.trim()) return;

        // Optimistic update for UI speed, but wait for ID from server
        const tempId = Date.now().toString();
        const tempAgency = { id: tempId, name: newAgencyName, score: 60 };
        setAgencies([...agencies, tempAgency]);
        setIsAdding(false);
        setNewAgencyName("");

        // Sync with server
        await addAgencyAction(newAgencyName);
        // Reload to get real ID
        loadAgencies();
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-green-600";
        if (score >= 70) return "text-yellow-600";
        return "text-orange-600";
    };

    const [showAll, setShowAll] = useState(false);

    // Filter agencies for display: Default to top 3 (Alpha, Beta, Gamma typically) unless showAll is true
    const visibleAgencies = showAll ? agencies : agencies.slice(0, 3);
    const hasMore = agencies.length > 3;

    if (isLoading) return (
        <Card className="h-full flex flex-col justify-center items-center">
            <div className="text-sm text-gray-500">Loading agencies...</div>
        </Card>
    );

    return (
        <Card className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-[var(--color-secondary)]">
                    Agency Administration
                </h3>
                {!isEditing && (
                    <button
                        onClick={handleModify}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-3 py-1 rounded bg-blue-50 transition-colors"
                    >
                        Modify
                    </button>
                )}
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto min-h-[100px]">
                {visibleAgencies.map((agency) => (
                    <div key={agency.id} className="flex justify-between items-center text-sm h-9">
                        <span className="font-medium text-gray-700">{agency.name}</span>

                        {isEditing ? (
                            <div className="flex gap-2">
                                <button
                                    className="px-3 py-1 text-xs font-medium text-[var(--color-primary)] bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1 transition-colors"
                                    onClick={() => handleUpload(agency.id)}
                                    title="Upload Performance Data to Update Score"
                                >
                                    <Upload className="w-3 h-3" />
                                    Upload Data
                                </button>
                                <button
                                    onClick={() => handleRemove(agency.id)}
                                    className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                        ) : (
                            <span className={`font-bold ${getScoreColor(agency.score)}`}>
                                {agency.score}%
                            </span>
                        )}
                    </div>
                ))}

                {/* Expand/Collapse Button */}
                {hasMore && !isEditing && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="w-full text-center text-xs text-gray-400 hover:text-[var(--color-primary)] py-1 flex items-center justify-center gap-1 transition-colors"
                    >
                        {showAll ? 'Show Less' : `+ ${agencies.length - 3} More`}
                    </button>
                )}

                {/* Input Row for New Agency */}
                {isAdding && (
                    <div className="flex justify-between items-center text-sm h-9 bg-blue-50 p-2 rounded border border-blue-100 animate-in fade-in slide-in-from-top-1">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Agency Name"
                            className="text-xs border border-gray-300 rounded px-2 py-1 w-full mr-2 focus:outline-none focus:border-blue-500"
                            value={newAgencyName}
                            onChange={(e) => setNewAgencyName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && confirmAdd()}
                        />
                        <div className="flex gap-1">
                            <button
                                onClick={confirmAdd}
                                className="px-2 py-1 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                            <button
                                onClick={cancelAdd}
                                className="px-2 py-1 text-xs font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 rounded transition-colors"
                            >
                                x
                            </button>
                        </div>
                    </div>
                )}


                {agencies.length === 0 && !isAdding && (
                    <div className="text-xs text-gray-400 italic text-center py-4">No agencies listed</div>
                )}
            </div>

            {isEditing && (
                <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="flex gap-2">
                        <button
                            onClick={startAdd}
                            disabled={isAdding}
                            className={`flex items-center gap-1 text-xs font-bold text-[var(--color-primary)] hover:text-blue-700 transition-colors ${isAdding ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Plus className="w-4 h-4" />
                            Add Agency
                        </button>
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700 transition-colors ml-2"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset System
                        </button>
                    </div>

                    <button
                        onClick={handleSave}
                        className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-white bg-[var(--color-primary)] hover:bg-blue-700 rounded shadow-sm transition-colors"
                    >
                        <Save className="w-3 h-3" />
                        Save
                    </button>
                </div>
            )}
        </Card>
    );
};
