import axios from 'axios';

/**
 * Configure the axios instance to point to the FastAPI server.
 * Default port for FastAPI is 8000.
 */
export const apiClient = axios.create({
    baseURL: 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
});

/**
 * Interceptor: Automatically attach the JWT token to every request if it exists.
 */
apiClient.interceptors.request.use((config) => {
    // Retrieve the token from the browser's local storage
    const token = localStorage.getItem('access_token');
    
    if (token) {
        // Inject the Bearer token into the Authorization header
        config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
}, (error) => {
    return Promise.reject(error);
});