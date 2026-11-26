// src/features/demo/components/DemoBanner.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw, UserRound, UsersRound } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/context/useAuth';
import { useConfirm } from '@/context/confirmContext';
import { notify } from '@/lib/notify';
import { UserRole } from '@/types';
import { useDemo } from '@/features/demo/hooks/useDemo';

/**
 * Shown above the header on the demo instance only: explains that the data is temporary,
 * switches between the manager's and an employee's view, and starts over with a fresh sandbox.
 */
export default function DemoBanner() {
    const { isEnabled, sandboxTtlHours, start, switchRole } = useDemo();
    const { user } = useAuth();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [isBusy, setIsBusy] = useState(false);

    if (!isEnabled || !user) return null;

    const isEmployeeView = user.role === UserRole.EMPLOYEE;

    const handleSwitch = async () => {
        setIsBusy(true);
        try {
            await switchRole(isEmployeeView ? 'manager' : 'employee');
            navigate('/');
        } catch (err) {
            notify.error(err, 'החלפת התצוגה נכשלה');
        } finally {
            setIsBusy(false);
        }
    };

    const handleRestart = async () => {
        const confirmed = await confirm({
            title: 'להתחיל מחדש?',
            description: 'תיווצר סביבת הדגמה חדשה עם הנתונים המקוריים. השינויים שעשית כאן לא יועברו אליה.',
            confirmText: 'התחלה מחדש',
        });
        if (!confirmed) return;

        setIsBusy(true);
        try {
            await start();
            navigate('/');
            notify.success('נוצרה סביבת הדגמה חדשה');
        } catch (err) {
            notify.error(err, 'יצירת סביבת הדגמה חדשה נכשלה');
        } finally {
            setIsBusy(false);
        }
    };

    // Light buttons on the amber banner
    const buttonClass = 'gap-1.5 rounded-md border-amber-300 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-white';

    return (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
            <div className="flex items-center gap-2 min-w-0">
                <FlaskConical size={16} className="shrink-0" />
                <span className="truncate">
                    סביבת הדגמה: הנתונים שלך פרטיים ונמחקים אוטומטית אחרי {Math.round(sandboxTtlHours)} שעות.
                </span>
            </div>
            <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleSwitch} disabled={isBusy} className={buttonClass}>
                    {isEmployeeView ? <UsersRound size={14} /> : <UserRound size={14} />}
                    {isEmployeeView ? 'צפה כמנהל' : 'צפה כעובד'}
                </Button>
                <Button variant="outline" onClick={handleRestart} disabled={isBusy} className={buttonClass}>
                    <RotateCcw size={14} />
                    התחל מחדש
                </Button>
            </div>
        </div>
    );
}
