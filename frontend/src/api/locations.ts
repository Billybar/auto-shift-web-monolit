// src/api/locations.ts
import { apiClient } from './client';
import { UserRole } from '../types';
import type { DemandTemplate, DemandTemplateCell, LocationData, LocationWeights } from '../types';

/**
 * The locations the user can pick in the header. Staff get the server's scoped list (it includes the
 * locations of their linked clients); an employee gets their own location.
 */
export const getAllowedLocations = async (role: UserRole): Promise<LocationData[]> => {
    if (role !== UserRole.EMPLOYEE) {
        const response = await apiClient.get<LocationData[]>('/api/locations/');
        return response.data;
    }
    const response = await apiClient.get<{ locations?: LocationData[] }>('/api/users/me');
    return response.data.locations ?? [];
};

/**
 * Fetch optimization weights
 */
export const getLocationWeights = async (locationId: number): Promise<LocationWeights> => {
    const response = await apiClient.get(`/api/locations/${locationId}/weights`);
    return response.data;
};

/**
 * Update optimization weights.
 */
export const updateLocationWeights = async (locationId: number, weights: LocationWeights): Promise<LocationWeights> => {
    const response = await apiClient.put(`/api/locations/${locationId}/weights`, weights);
    return response.data;
};

/**
 * The weekly demand template: how many people each shift needs per role and weekday (cells above 0).
 */
export const getDemandTemplate = async (locationId: number): Promise<DemandTemplate> => {
    const response = await apiClient.get<DemandTemplate>(`/api/locations/${locationId}/demand-template`);
    return response.data;
};

/**
 * Replaces the template with the full desired state; cells left out (or 0) are cleared.
 */
export const updateDemandTemplate = async (locationId: number, cells: DemandTemplateCell[]): Promise<DemandTemplate> => {
    const response = await apiClient.put<DemandTemplate>(`/api/locations/${locationId}/demand-template`, { cells });
    return response.data;
};
