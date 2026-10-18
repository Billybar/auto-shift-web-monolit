import axios from 'axios';
import { router } from 'expo-router';
import { getToken, clearToken } from './tokenStorage';

// Backend URL, inlined at bundle time. `eas update --environment` ignores local .env files,
// so release bundles fall back to production: 10.0.2.2 (the Android emulator's alias for the
// dev machine) is unreachable from a real phone.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.0.2.2:8000' : 'https://autoshift.co.il');

export const apiClient = axios.create({
  baseURL: API_URL,
  // Without a timeout a request on a bad connection can hang forever; this turns it into an explainable error
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Lets the auth provider clear its in-memory session when any request comes back 401
let onUnauthorized: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

// Intercept requests to inject the JWT token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Intercept responses to handle global errors (e.g., 401 Unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Check if the original request was sent to the login endpoint
    const isLoginRequest = error.config && error.config.url && error.config.url.includes('/login');

    if (error.response?.status === 401 && !isLoginRequest) {
      // Clear the stored token and the in-memory session (expired or revoked token)
      await clearToken();
      onUnauthorized?.();
      // Force redirect to login screen on unauthorized access
      router.replace('/(auth)/login');
    }
    return Promise.reject(error);
  }
);


// Debug logging, development builds only. Release bundles compile __DEV__ to
// false and drop this block (responses contain JWTs and employee PII).
if (__DEV__) {
  apiClient.interceptors.response.use(
    (response) => {
      // Log both the URL and the query parameters
      console.log(`[API SUCCESS] ${response.config.url}`);
      if (response.config.params) {
        console.log('Params:', JSON.stringify(response.config.params));
      }
      console.log('Data:', JSON.stringify(response.data, null, 2));
      return response;
    },
    (error) => {
      // Log the full requested URL to verify the .env variable is applied correctly
      const fullUrl = `${error.config?.baseURL || ''}${error.config?.url || ''}`;
      console.error(`[API ERROR] Tried to reach: ${fullUrl}`);
      console.error(`[API ERROR] Error details:`, error.message);
      // Print the exact HTTP method that caused the 405 error
      console.error(`[API ERROR] Method sent:`, error.config?.method?.toUpperCase());
      return Promise.reject(error);
    }
  );
}