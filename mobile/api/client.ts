import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    // Read from AsyncStorage using the correct key 'access_token'
    const token = await AsyncStorage.getItem('access_token');
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
      // Clear token from AsyncStorage using the correct key
      await AsyncStorage.removeItem('access_token');
      // Force redirect to login screen on unauthorized access
      router.replace('/(auth)/login');
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