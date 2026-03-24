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


/**
 * Response Interceptor: Handle global errors like 401 Unauthorized.
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Check if the original request was sent to the login endpoint
    const isLoginRequest = error.config && error.config.url && error.config.url.includes('/login');

    // If it's a 401 error and it did *not* originate from the login page, log the user out
    if (error.response && error.response.status === 401 && !isLoginRequest) {
      console.warn('Unauthorized request or token expired. Redirecting to login.');
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    
    // Always reject the promise so the calling component can handle the error
    return Promise.reject(error);
  }
);