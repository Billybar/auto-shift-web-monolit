// src/features/demo/components/DemoBanner.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw, UserRound, UsersRound } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useConfirm } from '../../../context/confirmContext';
import { notify } from '../../../lib/notify';
import { UserRole } from '../../../types';
import { useDemo } from '../hooks/useDemo';

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

    const buttonClass =
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-300 bg-white/70 text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    return (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
            <div className="flex items-center gap-2 min-w-0">
                <FlaskConical size={16} className="shrink-0" />
                <span className="truncate">
                    סביבת הדגמה: הנתונים שלך פרטיים ונמחקים אוטומטית אחרי {Math.round(sandboxTtlHours)} שעות.
                </span>
            </div>
            <div className="flex items-center gap-2">
                <button type="button" onClick={handleSwitch} disabled={isBusy} className={buttonClass}>
                    {isEmployeeView ? <UsersRound size={14} /> : <UserRound size={14} />}
                    {isEmployeeView ? 'צפה כמנהל' : 'צפה כעובד'}
                </button>
                <button type="button" onClick={handleRestart} disabled={isBusy} className={buttonClass}>
                    <RotateCcw size={14} />
                    התחל מחדש
                </button>
            </div>
        </div>
    );
}
