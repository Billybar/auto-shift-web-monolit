import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Alert, 
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Lock, ShieldCheck, ArrowRight } from 'lucide-react-native';
import { requestPasswordReset, confirmPasswordReset } from '../../../api/auth';

type ResetStep = 'EMAIL_INPUT' | 'OTP_INPUT' | 'SUCCESS';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<ResetStep>('EMAIL_INPUT');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Request OTP
  const handleRequestOtp = async () => {
    if (!email.trim()) {
      Alert.alert('שגיאה', 'אנא הזן כתובת אימייל.');
      return;
    }

    try {
      setIsLoading(true);
      await requestPasswordReset({ email });
      setStep('OTP_INPUT');
    } catch (error) {
      console.error('Failed to request reset:', error);
      Alert.alert('שגיאה', 'אירעה שגיאה בשליחת הבקשה. נסה שוב שוב.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Confirm Reset
  const handleConfirmReset = async () => {
    if (otp.length !== 6) {
      Alert.alert('שגיאה', 'קוד ה-OTP חייב להכיל בדיוק 6 ספרות.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('שגיאה', 'הסיסמא חייבת להכיל לפחות 8 תווים.');
      return;
    }

    try {
      setIsLoading(true);
      await confirmPasswordReset({ email, otp, new_password: newPassword });
      setStep('SUCCESS');
    } catch (error: any) {
      console.error('Reset failed:', error);
      const errorMsg = error.response?.data?.detail || 'הקוד שגוי או פג תוקפו.';
      Alert.alert('שגיאה', errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50"
    >
      {/* Use ScrollView to handle taps naturally without dismissing the keyboard prematurely */}
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
          <View className="mb-10 items-center">
            <Text className="text-4xl font-bold text-blue-600 mb-2">Auto Shift</Text>
            <Text className="text-base text-gray-500">
              {step === 'EMAIL_INPUT' && 'איפוס סיסמה'}
              {step === 'OTP_INPUT' && 'הזן את קוד האימות שנשלח למייל'}
              {step === 'SUCCESS' && 'הסיסמה אופסה בהצלחה'}
            </Text>
          </View>

          {/* STEP 1: Email Input Form */}
          {step === 'EMAIL_INPUT' && (
            <View className="space-y-5">
              <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-4 h-14">
                <Mail color="#9ca3af" size={20} />
                <TextInput
                  className="flex-1 px-3 text-right text-gray-900"
                  placeholder="כתובת אימייל"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!isLoading}
                />
              </View>

              <TouchableOpacity 
                className="w-full bg-blue-600 h-14 rounded-xl items-center justify-center mt-4 shadow-sm shadow-blue-200"
                onPress={handleRequestOtp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold text-lg">שלח קוד אימות</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                className="items-center mt-3"
                onPress={() => router.back()}
              >
                <Text className="text-sm font-medium text-blue-600">חזרה להתחברות</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: OTP & New Password Form */}
          {step === 'OTP_INPUT' && (
            <View className="space-y-5">
              <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-4 h-14">
                <ShieldCheck color="#9ca3af" size={20} />
                <TextInput
                  className="flex-1 px-3 text-center tracking-widest text-lg font-bold text-gray-900"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  editable={!isLoading}
                />
              </View>

              <View className="flex-row items-center bg-white border border-gray-300 rounded-xl px-4 h-14">
                <Lock color="#9ca3af" size={20} />
                <TextInput
                  className="flex-1 px-3 text-right text-gray-900"
                  placeholder="סיסמה חדשה (לפחות 8 תווים)"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>

              <TouchableOpacity 
                className="w-full bg-blue-600 h-14 rounded-xl items-center justify-center mt-4 shadow-sm shadow-blue-200"
                onPress={handleConfirmReset}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold text-lg">אפס סיסמה</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3: Success State */}
          {step === 'SUCCESS' && (
            <View className="items-center space-y-6">
              <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-2">
                <ShieldCheck color="#16a34a" size={32} />
              </View>
              <Text className="text-center text-gray-600 text-base">
                הסיסמה אופסה בהצלחה. כעת תוכל להתחבר למערכת עם הסיסמה החדשה.
              </Text>

              <TouchableOpacity 
                className="w-full bg-blue-600 h-14 rounded-xl items-center justify-center mt-4 shadow-sm shadow-blue-200 flex-row"
                onPress={() => router.replace('/(auth)/login')}
              >
                <Text className="text-white font-semibold text-lg ml-2">להתחברות</Text>
                <ArrowRight color="#ffffff" size={20} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
    </KeyboardAvoidingView>
  );
}