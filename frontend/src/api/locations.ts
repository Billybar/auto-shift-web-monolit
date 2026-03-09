// src/api/locations.ts
import { apiClient } from './client';
import type { LocationData, WeightsUpdate, Weights } from '../types';

/**
 * Fetches a specific location by ID, including its nested weights.
 */
export const getLocationById = async (locationId: number): Promise<LocationData> => {
    const response = await apiClient.get<LocationData>(`/locations/${locationId}`);
    return response.data;
};

/**
 * Updates the global optimization weights for a specific location.
 */
export const updateLocationWeights = async (locationId: number, weights: WeightsUpdate): Promise<Weights> => {
    const response = await apiClient.put<Weights>(`/locations/${locationId}/weights`, weights);
    return response.data;
};