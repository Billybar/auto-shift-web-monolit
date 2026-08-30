import { apiClient } from './client';

// Using the same Employee interface from your Web types
export interface Employee {
  id: number;
  user?: {
    first_name: string;
    last_name: string;
  };
  name?: string; // Fallback for Grid type
  location_id: number;
  color: string;
}

export const fetchEmployeesByLocation = async (locationId: number): Promise<Employee[]> => {
  const response = await apiClient.get<Employee[]>('/api/employees/', {
    params: { location_id: locationId }
  });
  return response.data;
};