import { apiClient } from "./client";

/**
 * Authenticate with the backend and store the JWT token.
 * Uses 'application/x-www-form-urlencoded' as required by FastAPI OAuth2.
 */
export const loginAsAdmin = async () => {
    const formData = new URLSearchParams();
    // Using the default seeded admin credentials from your seed.py
    formData.append('username', 'admin');
    formData.append('password', 'admin');

    try {
        const response = await apiClient.post('/auth/login', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        // Save the token to localStorage
        const token = response.data.access_token;
        localStorage.setItem('access_token', token);
        console.log("Successfully logged in and saved token!");
        
        return token;
    } catch (error) {
        console.error("Login failed:", error);
        throw error;
    }
};