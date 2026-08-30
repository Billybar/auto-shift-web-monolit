import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Set your backend URL. 
// Note: For Android emulators, localhost is mapped to 10.0.2.2
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept requests to inject the JWT token
apiClient.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('auth_token');
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
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      // Additional logic to redirect to login can be handled globally
    }
    return Promise.reject(error);
  }
);


// For Debugging
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
    console.error(`[API ERROR] ${error.config?.url}`);
    return Promise.reject(error);
  }
);