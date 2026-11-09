// frontend/src/api/admin.ts
import { apiClient } from './client';
import type {
    Client,
    ClientCreate,
    LocationCreate,
    LocationData,
    Organization,
    OrganizationCreate,
    StaffUser,
    StaffUserCreate,
    StaffUserUpdate,
} from '../types';

// The API pages at 100 by default; the dashboard shows whole lists
const LIST_PARAMS = { limit: 1000 };

export const getOrganizations = async (): Promise<Organization[]> => {
    const response = await apiClient.get('/api/organizations/', { params: LIST_PARAMS });
    return response.data;
};

export const createOrganization = async (data: OrganizationCreate): Promise<Organization> => {
    const response = await apiClient.post('/api/organizations/', data);
    return response.data;
};

export const getClients = async (): Promise<Client[]> => {
    const response = await apiClient.get('/api/clients/', { params: LIST_PARAMS });
    return response.data;
};

export const createClient = async (data: ClientCreate): Promise<Client> => {
    const response = await apiClient.post('/api/clients/', data);
    return response.data;
};

export const getAllLocations = async (): Promise<LocationData[]> => {
    const response = await apiClient.get('/api/locations/', { params: LIST_PARAMS });
    return response.data;
};

export const createLocation = async (data: LocationCreate): Promise<LocationData> => {
    const response = await apiClient.post('/api/locations/', data);
    return response.data;
};

export const getStaffUsers = async (): Promise<StaffUser[]> => {
    const response = await apiClient.get('/api/users/', { params: { ...LIST_PARAMS, staff_only: true } });
    return response.data;
};

export const createStaffUser = async (data: StaffUserCreate): Promise<StaffUser> => {
    const response = await apiClient.post('/api/users/', data);
    return response.data;
};

export const updateStaffUser = async (id: number, data: StaffUserUpdate): Promise<StaffUser> => {
    const response = await apiClient.put(`/api/users/${id}`, data);
    return response.data;
};

export const deleteStaffUser = async (id: number): Promise<void> => {
    await apiClient.delete(`/api/users/${id}`);
};
