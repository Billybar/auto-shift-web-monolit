// src/api/locations.ts
import { apiClient } from './client';
import type { LocationData, LocationWeights } from '../types';

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