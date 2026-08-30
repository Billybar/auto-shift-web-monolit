import {apiClient} from './client';

// Keep API parameters and return types identical to the React frontend
export const login = async (username: string, password: string) => {
  // Axios automatically serializes the object to urlencoded when the header is set
  const response = await apiClient.post('/api/auth/login', {
    username,
    password
  }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  
  return response.data;
};