// src/features/admin/HierarchyTab.tsx
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Building2, Briefcase, MapPin, Plus } from 'lucide-react';

import Button from '@/components/ui/Button';
import InlineAlert from '@/components/ui/InlineAlert';
import type { Client, LocationData, Organization } from '@/types';
import { ADD_COPY, useAddToHierarchy } from './hooks/useAddToHierarchy';
import type { AddTarget } from './hooks/useAddToHierarchy';

const sameTarget = (a: AddTarget | null, b: AddTarget): boolean => JSON.stringify(a) === JSON.stringify(b);

interface HierarchyTabProps {
    organizations: Organization[];
    clients: Client[];
    locations: LocationData[];
}

/**
 * The tree of organizations → clients → locations, with an add action at each level.
 */
export default function HierarchyTab({ organizations, clients, locations }: HierarchyTabProps) {
    const { add, isAdding, error, resetError } = useAddToHierarchy();
    // The one add form that can be open
    const [target, setTarget] = useState<AddTarget | null>(null);
    const [name, setName] = useState<string>('');

    const openForm = (next: AddTarget) => {
        setTarget(next);
        setName('');
        resetError();
    };

    const closeForm = () => {
        setTarget(null);
        resetError();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (target && await add(target, name)) closeForm();
    };

    const renderAddForm = (forTarget: AddTarget): ReactNode => {
        if (!sameTarget(target, forTarget)) return null;
        return (
            <form onSubmit={handleSubmit} className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        required
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={ADD_COPY[forTarget.kind].placeholder}
                        className="flex-1 max-w-sm border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <Button type="submit" variant="success" loading={isAdding} disabled={!name.trim()} className="px-3">
                        {isAdding ? 'שומר...' : 'הוסף'}
                    </Button>
                    <Button variant="secondary" onClick={closeForm} className="px-3">
                        ביטול
                    </Button>
                </div>
                {error && (
                    <InlineAlert variant="error" title={ADD_COPY[forTarget.kind].failure}>{error}</InlineAlert>
                )}
            </form>
        );
    };

    const addButton = (label: string, forTarget: AddTarget): ReactNode => (
        <button
            type="button"
            onClick={() => openForm(forTarget)}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
        >
            <Plus size={14} />
            {label}
        </button>
    );

    return (
        <div className="space-y-4">
            <div>
                <Button onClick={() => openForm({ kind: 'organization' })} className="px-3">
                    <Plus size={16} />
                    ארגון חדש
                </Button>
                {renderAddForm({ kind: 'organization' })}
            </div>

            {organizations.length === 0 && (
                <p className="text-sm text-slate-500">עדיין אין ארגונים. התחל בהוספת ארגון.</p>
            )}

            {organizations.map((organization) => {
                const organizationClients = clients.filter((c) => c.organization_id === organization.id);
                return (
                    <section key={organization.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                                <Building2 size={18} className="text-slate-500" />
                                {organization.name}
                            </h3>
                            {addButton('לקוח חדש', { kind: 'client', organizationId: organization.id })}
                        </div>
                        {renderAddForm({ kind: 'client', organizationId: organization.id })}

                        <ul className="mt-3 space-y-3 ps-6">
                            {organizationClients.map((client) => {
                                const clientLocations = locations.filter((l) => l.client_id === client.id);
                                return (
                                    <li key={client.id}>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                                <Briefcase size={16} className="text-slate-500" />
                                                {client.name}
                                            </span>
                                            {addButton('אתר חדש', { kind: 'location', clientId: client.id })}
                                        </div>
                                        {renderAddForm({ kind: 'location', clientId: client.id })}

                                        <ul className="mt-2 space-y-1 ps-6">
                                            {clientLocations.map((location) => (
                                                <li key={location.id} className="flex items-center gap-2 text-sm text-slate-700">
                                                    <MapPin size={14} className="text-slate-400" />
                                                    {location.name}
                                                </li>
                                            ))}
                                            {clientLocations.length === 0 && (
                                                <li className="text-xs text-slate-400">אין אתרים עדיין</li>
                                            )}
                                        </ul>
                                    </li>
                                );
                            })}
                            {organizationClients.length === 0 && (
                                <li className="text-xs text-slate-400">אין לקוחות עדיין</li>
                            )}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
