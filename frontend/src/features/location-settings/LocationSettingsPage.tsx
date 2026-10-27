// src/features/location-settings/LocationSettingsPage.tsx
import { Tabs } from 'radix-ui';

import InlineAlert from '../../components/ui/InlineAlert';
import { useAppLocation } from '../../context/LocationContext';
import { usePositions } from '../positions/hooks/usePositions';
import ConstraintGroupsManager from './ConstraintGroupsManager';
import DemandTemplateEditor from './DemandTemplateEditor';
import PositionsManager from './PositionsManager';

const TAB_TRIGGER_CLASS =
    'px-4 py-2 text-sm font-medium text-slate-600 border-b-2 border-transparent -mb-px transition ' +
    'hover:text-slate-900 data-[state=active]:border-blue-600 data-[state=active]:text-blue-700';

/**
 * Site settings (הגדרות אתר): the location's roles, its weekly demand template, and the rows of
 * its constraints board.
 */
export default function LocationSettingsPage() {
    const { selectedLocationId } = useAppLocation();
    const locationId = selectedLocationId || null;
    const { positions, activePositions, isLoading, loadError, reload } = usePositions(locationId);

    if (!locationId) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4 text-slate-500">
                <h2 className="text-xl font-medium">בחר אתר בתפריט העליון כדי לערוך את ההגדרות שלו</h2>
            </div>
        );
    }

    if (isLoading && positions.length === 0) {
        return (
            <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (loadError) {
        return (
            <InlineAlert variant="error" title="טעינת התפקידים נכשלה" action={{ label: 'נסה שוב', onClick: reload }}>
                {loadError.message}
            </InlineAlert>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <Tabs.Root defaultValue="positions" dir="rtl">
                <Tabs.List className="flex border-b border-slate-200 mb-4" aria-label="הגדרות אתר">
                    <Tabs.Trigger value="positions" className={TAB_TRIGGER_CLASS}>תפקידים</Tabs.Trigger>
                    <Tabs.Trigger value="template" className={TAB_TRIGGER_CLASS}>תקן שבועי</Tabs.Trigger>
                    <Tabs.Trigger value="constraint-rows" className={TAB_TRIGGER_CLASS}>שורות בלוח האילוצים</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="positions" className="focus:outline-none">
                    <PositionsManager locationId={locationId} positions={positions} onChanged={reload} />
                </Tabs.Content>
                <Tabs.Content value="template" className="focus:outline-none">
                    {/* Keyed on the roles, so the editor reloads after roles change in the other tab */}
                    <DemandTemplateEditor
                        key={activePositions.map(p => p.id).join(',')}
                        locationId={locationId}
                        positions={activePositions}
                    />
                </Tabs.Content>
                <Tabs.Content value="constraint-rows" className="focus:outline-none">
                    <ConstraintGroupsManager locationId={locationId} />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}
