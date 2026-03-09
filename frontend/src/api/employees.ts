// src/api/employees.ts
import { apiClient } from './client';
import type { Employee, EmployeeCreate, EmployeeSettingsUpdate } from '../types';

/**
 * Fetches all employees for a specific location.
 * @param locationId The ID of the current workplace location
 * @returns A promise that resolves to an array of Employee objects
 */
export const getEmployeesByLocation = async (locationId: number): Promise<Employee[]> => {
    // Making a GET request to /employees/?location_id={locationId}
    const response = await apiClient.get<Employee[]>('/employees/', {
        params: { location_id: locationId }
    });
    
    return response.data;
};

/**
 * Sends a POST request to create a new employee.
 * @param employeeData The data for the new employee
 * @returns The newly created employee object from the server
 */
export const createEmployee = async (employeeData: EmployeeCreate): Promise<Employee> => {
    const response = await apiClient.post<Employee>('/employees/', employeeData);
    return response.data;
};

export const updateEmployee = async (employeeId: number, employeeData: EmployeeCreate): Promise<Employee> => {
    const response = await apiClient.put<Employee>(`/employees/${employeeId}`, employeeData);
    return response.data;
};

export const updateEmployeeSettings = async (employeeId: number, settings: EmployeeSettingsUpdate) => {
    const response = await apiClient.put(`/employees/${employeeId}/settings`, settings);
    return response.data;
};