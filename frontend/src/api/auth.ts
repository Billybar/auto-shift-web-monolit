import { apiClient } from "./client";
import type { LoginResponse } from '../types/index';

/**
 * Authenticates the user against the FastAPI backend.
 * NOTE: FastAPI's OAuth2PasswordRequestForm requires 'application/x-www-form-urlencoded'
 */
export const loginUser = async (username: string, password: string): Promise<LoginResponse> => {
  // Convert standard JS object to URL encoded form data
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  // The path depends on your main FastAPI router prefix. Based on your code, it's likely /auth/login
  const response = await apiClient.post<LoginResponse>('/api/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return response.data;
};