// src/features/admin/UserFormModal.tsx
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { createStaffUser, updateStaffUser } from '@/api/admin';
import { logError, toAppError } from '@/api/errors';
import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import { notify } from '@/lib/notify';
import { UserRole } from '@/types';
import type { Client, LocationData, Organization, StaffRole, StaffUser } from '@/types';

const MIN_PASSWORD_LENGTH = 8;

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
    { value: UserRole.MANAGER, label: 'מנהל' },
    { value: UserRole.SCHEDULER, label: 'סדרן' },
    { value: UserRole.ADMIN, label: 'מנהל מערכת' },
];

const toggleId = (ids: number[], id: number): number[] =>
    ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];

interface UserFormModalProps {
    /** The user being edited; omit to create a new one */
    user?: StaffUser;
    /** Editing the signed-in admin: the email and role are locked */
    isOwnAccount?: boolean;
    organizations: Organization[];
    clients: Client[];
    locations: LocationData[];
    onClose: () => void;
    onSaved: () => Promise<void> | void;
}

/**
 * Creates or edits a staff login. Managers and schedulers get an organization and a client / location scope;
 * an admin has global access, so those fields are hidden.
 */
export default function UserFormModal({ user, isOwnAccount = false, organizations, clients, locations, onClose, onSaved }: UserFormModalProps) {
    const isEditMode = user !== undefined;

    const [firstName, setFirstName] = useState<string>(user?.first_name ?? '');
    const [lastName, setLastName] = useState<string>(user?.last_name ?? '');
    const [email, setEmail] = useState<string>(user?.email ?? '');
    const [password, setPassword] = useState<string>('');
    // This tab lists staff only, so a user's role is always a StaffRole
    const [role, setRole] = useState<StaffRole>((user?.role as StaffRole | undefined) ?? UserRole.MANAGER);
    const [organizationId, setOrganizationId] = useState<number | ''>(user?.organization_id ?? '');
    const [clientIds, setClientIds] = useState<number[]>(user?.clients.map((client) => client.id) ?? []);
    const [locationIds, setLocationIds] = useState<number[]>(user?.locations.map((location) => location.id) ?? []);

    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const isAdminRole = role === UserRole.ADMIN;

    const organizationClients = useMemo(
        () => clients.filter((client) => client.organization_id === organizationId),
        [clients, organizationId]
    );
    const organizationLocations = useMemo(() => {
        const clientIdsInOrganization = new Set(organizationClients.map((client) => client.id));
        return locations.filter((location) => clientIdsInOrganization.has(location.client_id));
    }, [locations, organizationClients]);

    const handleOrganizationChange = (value: string) => {
        setOrganizationId(value === '' ? '' : Number(value));
        // Selections from the previous organization would be refused by the server
        setClientIds([]);
        setLocationIds([]);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

        if (!isEditMode && password.length < MIN_PASSWORD_LENGTH) {
            setPasswordError(`הסיסמא חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`);
            return;
        }
        if (!isAdminRole && (organizationId === '' || (clientIds.length === 0 && locationIds.length === 0))) {
            setFormError('יש לבחור ארגון ולפחות לקוח או אתר אחד');
            return;
        }

        try {
            setIsSubmitting(true);
            setFormError(null);
            const fields = {
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: email.trim(),
                role,
                organization_id: isAdminRole || organizationId === '' ? null : organizationId,
                client_ids: isAdminRole ? [] : clientIds,
                location_ids: isAdminRole ? [] : locationIds,
            };
            if (isEditMode) {
                await updateStaffUser(user.id, fields);
                notify.success('המשתמש עודכן');
            } else {
                await createStaffUser({ ...fields, password });
                notify.success('המשתמש נוסף');
            }
            onClose();
            await onSaved();
        } catch (error) {
            logError('Failed to save user:', error);
            const appError = toAppError(error);
            if (appError.code === 'email_taken') {
                setEmailError(appError.message);
            } else {
                setFormError(appError.message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        // Closing is blocked while a save is in flight
        <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
            <DialogContent size="md" aria-describedby={undefined}>
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'עריכת משתמש' : 'יצירת משתמש חדש'}</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="user-first-name">שם פרטי</Label>
                            <Input id="user-first-name" type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="user-last-name">שם משפחה</Label>
                            <Input id="user-last-name" type="text" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="user-email">מייל</Label>
                        <Input
                            id="user-email"
                            type="email"
                            required
                            autoComplete="off"
                            disabled={isOwnAccount}
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                            invalid={!!emailError}
                        />
                        {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                    </div>

                    {!isEditMode && (
                        <div>
                            <Label htmlFor="user-password">סיסמא ראשונית</Label>
                            <Input
                                id="user-password"
                                type="password"
                                required
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                                invalid={!!passwordError}
                            />
                            {passwordError
                                ? <p className="text-xs text-red-600 mt-1">{passwordError}</p>
                                : <p className="text-xs text-gray-500 mt-1">לפחות {MIN_PASSWORD_LENGTH} תווים</p>}
                        </div>
                    )}

                    <div>
                        <Label htmlFor="user-role">הרשאה</Label>
                        <Select
                            id="user-role"
                            value={role}
                            disabled={isOwnAccount}
                            onChange={(e) => setRole(e.target.value as StaffRole)}
                        >
                            {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </Select>
                        {isAdminRole && (
                            <p className="text-xs text-gray-500 mt-1">למנהל מערכת יש גישה לכל הארגונים והאתרים.</p>
                        )}
                        {isOwnAccount && (
                            <p className="text-xs text-gray-500 mt-1">לא ניתן לשנות את המייל וההרשאה של החשבון שלך.</p>
                        )}
                    </div>

                    {!isAdminRole && (
                        <div className="bg-gray-50 p-3 rounded-lg space-y-3">
                            <div>
                                <Label htmlFor="user-organization">ארגון</Label>
                                <Select
                                    id="user-organization"
                                    value={organizationId}
                                    onChange={(e) => handleOrganizationChange(e.target.value)}
                                >
                                    <option value="">בחר ארגון</option>
                                    {organizations.map((organization) => (
                                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                                    ))}
                                </Select>
                            </div>

                            {organizationId !== '' && (
                                <>
                                    <fieldset>
                                        <legend className="text-xs font-medium text-gray-700 mb-1">לקוחות (גישה לכל האתרים של הלקוח)</legend>
                                        {organizationClients.length === 0 && <p className="text-xs text-gray-400">אין לקוחות בארגון זה</p>}
                                        {organizationClients.map((client) => (
                                            <label key={client.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={clientIds.includes(client.id)}
                                                    onChange={() => setClientIds((ids) => toggleId(ids, client.id))}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                {client.name}
                                            </label>
                                        ))}
                                    </fieldset>
                                    <fieldset>
                                        <legend className="text-xs font-medium text-gray-700 mb-1">אתרים</legend>
                                        {organizationLocations.length === 0 && <p className="text-xs text-gray-400">אין אתרים בארגון זה</p>}
                                        {organizationLocations.map((location) => (
                                            <label key={location.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={locationIds.includes(location.id)}
                                                    onChange={() => setLocationIds((ids) => toggleId(ids, location.id))}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                {location.name}
                                            </label>
                                        ))}
                                    </fieldset>
                                </>
                            )}
                        </div>
                    )}

                    {formError && <InlineAlert variant="error" title={isEditMode ? 'שמירת המשתמש נכשלה' : 'יצירת המשתמש נכשלה'}>{formError}</InlineAlert>}

                    <DialogFooter className="mt-0 pt-2">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>ביטול</Button>
                        <Button type="submit" variant="success" loading={isSubmitting}>
                            {isSubmitting ? 'שומר...' : isEditMode ? 'שמור שינויים' : 'צור משתמש'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
