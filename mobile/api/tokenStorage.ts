import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'access_token';

// SecureStore (iOS Keychain / Android Keystore) is native-only; the Expo web build keeps AsyncStorage
const useSecureStore = Platform.OS !== 'web';

// In-memory copy so the request interceptor doesn't hit the keychain on every API call.
// undefined = not loaded yet, null = no token.
let cachedToken: string | null | undefined;

/**
 * Returns the stored JWT, or null when the user is signed out.
 */
export const getToken = async (): Promise<string | null> => {
  if (cachedToken === undefined) {
    const token = useSecureStore
      ? await SecureStore.getItemAsync(TOKEN_KEY)
      : await AsyncStorage.getItem(TOKEN_KEY);
    // A login or logout during the read wins over the value from storage
    if (cachedToken === undefined) {
      cachedToken = token;
    }
  }
  return cachedToken ?? null;
};

/**
 * Persists a newly issued JWT.
 */
export const setToken = async (token: string): Promise<void> => {
  cachedToken = token;
  if (useSecureStore) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
};

/**
 * Removes the stored JWT.
 */
export const clearToken = async (): Promise<void> => {
  cachedToken = null;
  if (useSecureStore) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
};
