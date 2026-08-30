import { apiClient } from './client';

// Define the Assignment interface based on your Web types
export interface Assignment {
  employee_id: number;
  shift_id: number;
  date: string;
  // Optional fields for UI mapping
  shift_name?: string;
  start_time?: string;
  end_time?: string;
}

// Fetch schedule matching the exact signature used in the Web frontend
export const fetchAssignments = async (
  locationId: number, 
  startDate: string, 
  endDate: string
): Promise<Assignment[]> => {
  const response = await apiClient.get('/api/assignments/', {
    params: { 
      location_id: locationId, 
      start_date: startDate, 
      end_date: endDate 
    }
  });
  return response.data;
};