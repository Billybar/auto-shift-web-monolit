// src/features/schedule/SchedulePage.tsx
import React, { useState, useEffect } from 'react';
import { getLocationById, updateLocationWeights } from '../../api/locations';
import type { LocationData, WeightsUpdate } from '../../types';
import { Settings, Play, Save } from 'lucide-react'; // icons for nice buttons

export default function SchedulePage() {
    const [location, setLocation] = useState<LocationData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    
    // Modal State
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Weights Form State
    const [weights, setWeights] = useState<WeightsUpdate>({
        target_shifts: 40,
        rest_gap: 40,
        consecutive_nights: 100,
        max_nights: 5,
        max_mornings: 6,
        max_evenings: 2,
        min_nights: 0,
        min_mornings: 0,
        min_evenings: 0,
    });

    const CURRENT_LOCATION_ID = 3; // MVP Hardcoded

    const fetchLocationData = async () => {
        try {
            setLoading(true);
            const data = await getLocationById(CURRENT_LOCATION_ID);
            setLocation(data);
            
            // Populate form with existing weights if they exist in DB
            if (data.weights) {
                setWeights({
                    target_shifts: data.weights.target_shifts,
                    rest_gap: data.weights.rest_gap,
                    consecutive_nights: data.weights.consecutive_nights,
                    max_nights: data.weights.max_nights,
                    max_mornings: data.weights.max_mornings,
                    max_evenings: data.weights.max_evenings,
                    min_nights: data.weights.min_nights,
                    min_mornings: data.weights.min_mornings,
                    min_evenings: data.weights.min_evenings,
                });
            }
        } catch (error) {
            console.error("Failed to fetch location data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLocationData();
    }, []);

    const handleSaveWeights = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            await updateLocationWeights(CURRENT_LOCATION_ID, weights);
            await fetchLocationData(); // refresh after reload
            setIsSettingsOpen(false);
        } catch (error) {
            console.error("Failed to update weights:", error);
            alert("Failed to save optimization settings.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
    }

    return (
        <div className="flex h-full flex-col space-y-4">
            {/* Header Actions */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Weekly Schedule Board</h2>
                    <p className="text-sm text-gray-500">Location: {location?.name}</p>
                </div>
                
                <div className="flex space-x-3 space-x-reverse">
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition border border-slate-300"
                    >
                        <Settings size={18} />
                        Optimization Weights
                    </button>
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition">
                        <Play size={18} />
                        Auto Assign
                    </button>
                    <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition">
                        <Save size={18} />
                        Publish
                    </button>
                </div>
            </div>

            {/* Empty Grid Placeholder */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-grow flex items-center justify-center border-dashed border-2">
                <div className="text-center">
                    <p className="text-gray-500 text-lg">Schedule Grid Construction Zone</p>
                    <p className="text-sm text-gray-400 mt-2">Will be populated by OR-Tools Engine</p>
                </div>
            </div>

            {/* Weights Edit Modal */}
            {isSettingsOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Location Optimization Weights</h2>
                        <p className="text-sm text-gray-500 mb-6">
                            Adjust the penalty weights for the solver. Higher numbers mean the algorithm will try harder to avoid breaking these rules.
                        </p>
                        
                        <form onSubmit={handleSaveWeights} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Penalties */}
                                <div className="space-y-3 bg-red-50 p-4 rounded-lg border border-red-100">
                                    <h4 className="font-semibold text-red-800 text-sm">Strict Penalties</h4>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Rest Gap Penalty</label>
                                        <input type="number" min="0" value={weights.rest_gap} onChange={(e) => setWeights({...weights, rest_gap: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Consecutive Nights Penalty</label>
                                        <input type="number" min="0" value={weights.consecutive_nights} onChange={(e) => setWeights({...weights, consecutive_nights: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Target Shifts Penalty</label>
                                        <input type="number" min="0" value={weights.target_shifts} onChange={(e) => setWeights({...weights, target_shifts: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                    </div>
                                </div>

                                {/* Shift Limits */}
                                <div className="space-y-3 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    <h4 className="font-semibold text-blue-800 text-sm">Global Shift Limits</h4>
                                    
                                    {/* Mornings */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Min Mornings</label>
                                            <input type="number" min="0" value={weights.min_mornings} onChange={(e) => setWeights({...weights, min_mornings: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Max Mornings</label>
                                            <input type="number" min="0" value={weights.max_mornings} onChange={(e) => setWeights({...weights, max_mornings: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                    </div>

                                    {/* Evenings */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Min Evenings</label>
                                            <input type="number" min="0" value={weights.min_evenings} onChange={(e) => setWeights({...weights, min_evenings: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Max Evenings</label>
                                            <input type="number" min="0" value={weights.max_evenings} onChange={(e) => setWeights({...weights, max_evenings: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                    </div>

                                    {/* Nights */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Min Nights</label>
                                            <input type="number" min="0" value={weights.min_nights} onChange={(e) => setWeights({...weights, min_nights: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Max Nights</label>
                                            <input type="number" min="0" value={weights.max_nights} onChange={(e) => setWeights({...weights, max_nights: Number(e.target.value)})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                                <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition">
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50">
                                    {isSubmitting ? 'Saving...' : 'Save Weights'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}