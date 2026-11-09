// src/features/admin/HierarchyTab.tsx
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Building2, Briefcase, MapPin, Plus } from 'lucide-react';

import { createClient, createLocation, createOrganization } from '../../api/admin';
import { logError, toAppError } from '../../api/errors';
import InlineAlert from '../../components/ui/InlineAlert';
import { useAppLocation } from '../../context/LocationContext';
import { notify } from '../../lib/notify';
import type { Client, LocationData, Organization } from '../../types';

// The one add form that can be open: a new organization, or a child of the given parent
type AddTarget =
    | { kind: 'organization' }
    | { kind: 'client'; organizationId: number }
    | { kind: 'location'; clientId: number };

const ADD_COPY: Record<AddTarget['kind'], { placeholder: string; success: string; failure: string }> = {
    organization: { placeholder: 'שם הארגון', success: 'הארגון נוסף', failure: 'הוספת הארגון נכשלה' },
    client: { placeholder: 'שם הלקוח', success: 'הלקוח נוסף', failure: 'הוספת הלקוח נכשלה' },
    location: { placeholder: 'שם האתר', success: 'האתר נוסף', failure: 'הוספת האתר נכשלה' },
};

const sameTarget = (a: AddTarget | null, b: AddTarget): boolean => JSON.stringify(a) === JSON.stringify(b);

interface HierarchyTabProps {
    organizations: Organization[];
    clients: Client[];
    locations: LocationData[];
    onChanged: () => Promise<void> | void;
}

/**
 * The tree of organizations → clients → locations, with an add action at each level.
 */
export default function HierarchyTab({ organizations, clients, locations, onChanged }: HierarchyTabProps) {
    const { reloadLocations } = useAppLocation();
    const [target, setTarget] = useState<AddTarget | null>(null);
    const [name, setName] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [formError, setFormError] = useState<string | null>(null);

    const openForm = (next: AddTarget) => {
        setTarget(next);
        setName('');
        setFormError(null);
    };

    const closeForm = () => {
        setTarget(null);
        setFormError(null);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (!target || !trimmedName) return;
        const copy = ADD_COPY[target.kind];

        try {
            setIsSubmitting(true);
            setFormError(null);
            if (target.kind === 'organization') {
                await createOrganization({ name: trimmedName });
            } else if (target.kind === 'client') {
                await createClient({ name: trimmedName, organization_id: target.organizationId });
            } else {
                await createLocation({ name: trimmedName, client_id: target.clientId });
                // The header's location list is kept in LocationContext
                reloadLocations();
            }
            closeForm();
            notify.success(copy.success);
            await onChanged();
        } catch (error) {
            logError(copy.failure, error);
            setFormError(
                toAppError(error, target.kind === 'organization' ? { byStatus: { 400: 'כבר קיים ארגון בשם הזה. בחר שם אחר.' } } : {}).message
            );
        } finally {
            setIsSubmitting(false);
        }
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
                    <button
                        type="submit"
                        disabled={isSubmitting || !name.trim()}
                        className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                    >
                        {isSubmitting ? 'שומר...' : 'הוסף'}
                    </button>
                    <button
                        type="button"
                        onClick={closeForm}
                        className="px-3 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition"
                    >
                        ביטול
                    </button>
                </div>
                {formError && (
                    <InlineAlert variant="error" title={ADD_COPY[forTarget.kind].failure}>{formError}</InlineAlert>
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
                <button
                    type="button"
                    onClick={() => openForm({ kind: 'organization' })}
                    className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                    <Plus size={16} />
                    ארגון חדש
                </button>
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
