// src/api/employees.ts
import { apiClient } from './client';
import type { Employee, EmployeeCreate, EmployeeUpdate, EmployeeSettingsUpdate } from '../types';

/**
 * Fetches all employees for a specific location.
 * @param locationId The ID of the current workplace location
 * @returns A promise that resolves to an array of Employee objects
 */
export const getEmployeesByLocation = async (locationId: number): Promise<Employee[]> => {
    // Making a GET request to /employees/?location_id={locationId}
    const response = await apiClient.get<Employee[]>('/api/employees/', {
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
    const response = await apiClient.post<Employee>('/api/employees/', employeeData);
    return response.data;
};

export const updateEmployee = async (employeeId: number, employeeData: EmployeeUpdate): Promise<Employee> => {
    const response = await apiClient.put<Employee>(`/api/employees/${employeeId}`, employeeData);
    return response.data;
};

/**
 * Sends a DELETE request to permanently remove an employee.
 * @param employeeId The ID of the employee to delete
 * @returns A promise that resolves when the deletion is successful
 */
export const deleteEmployee = async (employeeId: number): Promise<void> => {
    await apiClient.delete(`/api/employees/${employeeId}`);
};

export const updateEmployeeSettings = async (employeeId: number, settings: EmployeeSettingsUpdate) => {
    const response = await apiClient.put(`/api/employees/${employeeId}/settings`, settings);
    return response.data;
};

