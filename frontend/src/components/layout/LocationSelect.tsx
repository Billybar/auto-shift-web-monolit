// src/components/layout/LocationSelect.tsx
import { Select } from '@/components/ui/Input';
import { useAppLocation } from '@/context/useAppLocation';

/** The header's location picker: every page shows the selected location's data. */
export default function LocationSelect() {
    const { selectedLocationId, setSelectedLocationId, availableLocations, isLoadingLocations } = useAppLocation();

    return (
        <Select
            aria-label="בחירת אתר"
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(Number(e.target.value))}
            disabled={isLoadingLocations || availableLocations.length === 0}
            className="w-56 rounded-lg bg-gray-50 px-2 py-1.5 disabled:cursor-not-allowed"
        >
            {isLoadingLocations ? (
                <option value="">טוען אתר...</option>
            ) : availableLocations.length === 0 ? (
                <option value="">לא נבחר אתר</option>
            ) : (
                availableLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))
            )}
        </Select>
    );
}
