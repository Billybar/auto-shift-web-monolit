import { apiClient } from './client';
import type { Employee } from '../src/types/index';

export const fetchEmployeesByLocation = async (locationId: number): Promise<Employee[]> => {
  const response = await apiClient.get<Employee[]>('/api/employees/', {
    params: { location_id: locationId }
  });
  return response.data;
};