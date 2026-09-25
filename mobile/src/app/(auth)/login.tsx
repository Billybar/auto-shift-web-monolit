import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useForm, Controller } from 'react-hook-form';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { User, Lock, Eye, EyeOff } from 'lucide-react-native';
import { loginUser } from '../../../api/auth';
import { useAuth } from '../../hooks/useAuth';
import { openPrivacyPolicy, openSupport } from '../../constants/links';

// Define the expected form fields strictly
interface LoginFormData {
  username: string;
  password: string;
}

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth(); // <-- Extract login function from Context
  const [showPassword, setShowPassword] = useState(false);
  
  // Initialize react-hook-form variables
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    defaultValues: {
      username: '',
      password: '',
    }
  });

  // Handle the authentication request
  const onSubmit = async (data: LoginFormData) => {
    try {
      // Used the extracted API function
      const response = await loginUser(data.username, data.password);

      // Pass the token to AuthContext, which handles storage and JWT decoding
      // Note: Assuming loginUser returns the data object directly (response.access_token)
      await login(response.access_token);
      
      // Navigate to the main tabs application flow
      router.replace('/(tabs)');
      
    } catch (error) {
      Alert.alert('שגיאת התחברות', 'שם משתמש או סיסמה אינם נכונים.');
      console.error('Login error:', error);
    }
  };

  return (
    // keyboard-controller's KeyboardAvoidingView works on Android edge-to-edge (the built-in one doesn't)
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-gray-50"
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 justify-center px-6">
          <View className="mb-10 items-center">
            <Text className="text-4xl font-bold text-blue-600 mb-2">Auto Shift</Text>
            <Text className="text-base text-gray-500">פורטל עובדים</Text>
          </View>

          <View className="space-y-5">
            {/* Username Field */}
            <View>
              <Controller
                control={control}
                rules={{ required: 'אנא הזן מספר עובד או שם משתמש' }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <View className={`flex-row items-center bg-white border rounded-xl px-4 h-14 ${errors.username ? 'border-red-500' : 'border-gray-300'}`}>
                    <User color="#9ca3af" size={20} />
                    <TextInput
                      className="flex-1 px-3 text-right text-gray-900"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      placeholder="מספר עובד / שם משתמש"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}
                name="username"
              />
              {errors.username && <Text className="text-red-500 text-xs mt-1 text-right">{errors.username.message}</Text>}
            </View>

            {/* Password Field */}
            <View>
              <Controller
                control={control}
                rules={{ required: 'אנא הזן סיסמה' }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <View className={`flex-row items-center bg-white border rounded-xl px-4 h-14 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}>
                    <Lock color="#9ca3af" size={20} />
                    <TextInput
                      className="flex-1 px-3 text-right text-gray-900"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      placeholder="סיסמה"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-2 -mr-2">
                      {showPassword ? <EyeOff color="#9ca3af" size={20} /> : <Eye color="#9ca3af" size={20} />}
                    </TouchableOpacity>
                  </View>
                )}
                name="password"
              />
              {errors.password && <Text className="text-red-500 text-xs mt-1 text-right">{errors.password.message}</Text>}
            </View>
            
            {/*Link to the password reset page */}
            <View className="flex-row justify-start mt-2">
              <TouchableOpacity onPress={() => router.push('/reset-password')}>
                <Text className="text-sm font-medium text-blue-600">שכחתי סיסמא</Text>
              </TouchableOpacity>
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              className="w-full bg-blue-600 h-14 rounded-xl items-center justify-center mt-4 shadow-sm shadow-blue-200"
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-semibold text-lg">היכנס למערכת</Text>
              )}
            </TouchableOpacity>

            {/* Support and privacy policy (open the public web pages) */}
            <View className="flex-row justify-center gap-6 mt-6">
              <TouchableOpacity onPress={openSupport}>
                <Text className="text-xs text-gray-500 underline">תמיכה</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openPrivacyPolicy}>
                <Text className="text-xs text-gray-500 underline">מדיניות פרטיות</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}