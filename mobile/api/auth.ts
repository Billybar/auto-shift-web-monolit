import { apiClient } from "./client";
import type { LoginResponse, ForgotPasswordRequest, ResetPasswordRequest, GenericResponse } from '../src/types/index';

/**
 * Authenticates the user against the FastAPI backend.
 * NOTE: FastAPI's OAuth2PasswordRequestForm requires 'application/x-www-form-urlencoded'
 */
export const loginUser = async (username: string, password: string): Promise<LoginResponse> => {
  // Convert standard JS object to URL encoded form data
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  // The path depends on your main FastAPI router prefix.
  const response = await apiClient.post<LoginResponse>('/api/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  return response.data;
};

/**
 * Requests an OTP to be sent to the user's email.
 */
export const requestPasswordReset = async (data: ForgotPasswordRequest): Promise<GenericResponse> => {
  const response = await apiClient.post<GenericResponse>('/api/auth/forgot-password', data);
  return response.data;
};

/**
 * Submits the OTP and new password to reset the user's password.
 */
export const confirmPasswordReset = async (data: ResetPasswordRequest): Promise<GenericResponse> => {
  const response = await apiClient.post<GenericResponse>('/api/auth/reset-password', data);
  return response.data;
};