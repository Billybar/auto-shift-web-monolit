// src/api/locations.ts
import { apiClient } from './client';
import type { DemandTemplate, DemandTemplateCell, LocationData, LocationWeights } from '../types';

/**
 * Fetches a specific location by ID, including its nested weights.
 */
export const getLocationById = async (locationId: number): Promise<LocationData> => {
    const response = await apiClient.get<LocationData>(`/api/locations/${locationId}`);
    return response.data;
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
