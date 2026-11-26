// src/features/admin/UserFormModal.tsx
import type { FormEvent } from 'react';

import InlineAlert from '@/components/ui/InlineAlert';
import Button from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { fieldErrorId } from '@/components/ui/fieldErrorId';
import FormField from '@/components/ui/FormField';
import { Input, Select } from '@/components/ui/Input';
import { ROLE_LABELS } from '@/lib/roleLabels';
import { UserRole } from '@/types';
import type { Client, LocationData, Organization, StaffRole, StaffUser } from '@/types';
import { MIN_PASSWORD_LENGTH, useStaffUserForm } from './hooks/useStaffUserForm';

const STAFF_ROLES: StaffRole[] = [UserRole.MANAGER, UserRole.SCHEDULER, UserRole.ADMIN];

interface UserFormModalProps {
    /** The user being edited; omit to create a new one */
    user?: StaffUser;
    /** Editing the signed-in admin: the email and role are locked */
    isOwnAccount?: boolean;
    organizations: Organization[];
    clients: Client[];
    locations: LocationData[];
    onClose: () => void;
}

/**
 * Creates or edits a staff login. Managers and schedulers get an organization and a client / location scope;
 * an admin has global access, so those fields are hidden. Mount it per user (a `key`): it starts from their values.
 */
export default function UserFormModal({ user, isOwnAccount = false, organizations, clients, locations, onClose }: UserFormModalProps) {
    const form = useStaffUserForm(user, clients, locations);
    const { values, errors, isEditMode, isAdminRole, isSubmitting } = form;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (await form.submit()) onClose();
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
                        <FormField label="שם פרטי" htmlFor="user-first-name">
                            <Input id="user-first-name" type="text" required value={values.firstName} onChange={(e) => form.setField('firstName', e.target.value)} />
                        </FormField>
                        <FormField label="שם משפחה" htmlFor="user-last-name">
                            <Input id="user-last-name" type="text" required value={values.lastName} onChange={(e) => form.setField('lastName', e.target.value)} />
                        </FormField>
                    </div>

                    <FormField label="מייל" htmlFor="user-email" error={errors.email}>
                        <Input
                            id="user-email"
                            type="email"
                            required
                            autoComplete="off"
                            disabled={isOwnAccount}
                            value={values.email}
                            onChange={(e) => form.setField('email', e.target.value)}
                            invalid={!!errors.email}
                            aria-describedby={errors.email ? fieldErrorId('user-email') : undefined}
                        />
                    </FormField>

                    {!isEditMode && (
                        <FormField
                            label="סיסמא ראשונית"
                            htmlFor="user-password"
                            error={errors.password}
                            hint={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}
                        >
                            <Input
                                id="user-password"
                                type="password"
                                required
                                autoComplete="new-password"
                                value={values.password}
                                onChange={(e) => form.setField('password', e.target.value)}
                                invalid={!!errors.password}
                                aria-describedby={errors.password ? fieldErrorId('user-password') : undefined}
                            />
                        </FormField>
                    )}

                    <FormField label="הרשאה" htmlFor="user-role">
                        <Select
                            id="user-role"
                            value={values.role}
                            disabled={isOwnAccount}
                            onChange={(e) => form.setField('role', e.target.value as StaffRole)}
                        >
                            {STAFF_ROLES.map((role) => (
                                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                            ))}
                        </Select>
                        {isAdminRole && (
                            <p className="text-xs text-slate-500 mt-1">למנהל מערכת יש גישה לכל הארגונים והאתרים.</p>
                        )}
                        {isOwnAccount && (
                            <p className="text-xs text-slate-500 mt-1">לא ניתן לשנות את המייל וההרשאה של החשבון שלך.</p>
                        )}
                    </FormField>

                    {!isAdminRole && (
                        <div className="bg-slate-50 p-3 rounded-lg space-y-3">
                            <FormField label="ארגון" htmlFor="user-organization">
                                <Select
                                    id="user-organization"
                                    value={values.organizationId}
                                    onChange={(e) => form.changeOrganization(e.target.value === '' ? '' : Number(e.target.value))}
                                >
                                    <option value="">בחר ארגון</option>
                                    {organizations.map((organization) => (
                                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                                    ))}
                                </Select>
                            </FormField>

                            {values.organizationId !== '' && (
                                <>
                                    <fieldset>
                                        <legend className="text-xs font-medium text-slate-700 mb-1">לקוחות (גישה לכל האתרים של הלקוח)</legend>
                                        {form.organizationClients.length === 0 && <p className="text-xs text-slate-400">אין לקוחות בארגון זה</p>}
                                        {form.organizationClients.map((client) => (
                                            <label key={client.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={values.clientIds.includes(client.id)}
                                                    onChange={() => form.toggleClient(client.id)}
                                                    className="w-4 h-4 text-blue-600"
                                                />
                                                {client.name}
                                            </label>
                                        ))}
                                    </fieldset>
                                    <fieldset>
                                        <legend className="text-xs font-medium text-slate-700 mb-1">אתרים</legend>
                                        {form.organizationLocations.length === 0 && <p className="text-xs text-slate-400">אין אתרים בארגון זה</p>}
                                        {form.organizationLocations.map((location) => (
                                            <label key={location.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={values.locationIds.includes(location.id)}
                                                    onChange={() => form.toggleLocation(location.id)}
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

                    {errors.form && <InlineAlert variant="error" title={isEditMode ? 'שמירת המשתמש נכשלה' : 'יצירת המשתמש נכשלה'}>{errors.form}</InlineAlert>}

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
