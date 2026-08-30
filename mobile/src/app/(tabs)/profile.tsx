import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, User as UserIcon, Mail, Hash, Phone } from 'lucide-react-native';
import { useAuth } from '../../hooks/useAuth'; // Adjust path to your AuthContext

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout(); // Clears context and local storage
    router.replace('/(auth)/login'); // Redirect to login page
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
      {/* Header Profile Section */}
      <View className="items-center mt-6 mb-8">
        <View className="w-24 h-24 bg-blue-100 rounded-full items-center justify-center mb-4">
          <UserIcon size={48} color="#2563eb" />
        </View>
        <Text className="text-2xl font-bold text-gray-800">
          {user?.first_name} {user?.last_name}
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          תפקיד: {user?.role === 'scheduler' ? 'מנהל סידור' : 'עובד'}
        </Text>
      </View>

      {/* Info Cards */}
      <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6">
        <Text className="text-lg font-semibold text-gray-800 mb-4 text-right">פרטים אישיים</Text>
        
        {/* Email */}
        <View className="flex-row items-center justify-end py-3 border-b border-gray-50 gap-3">
          <Text className="text-gray-600 text-right flex-1">{user?.email}</Text>
          <Text className="text-gray-800 font-medium w-24 text-right">דוא״ל</Text>
          <Mail size={18} color="#9ca3af" />
        </View>

        {/* Employee ID */}
        <View className="flex-row items-center justify-end py-3 border-b border-gray-50 gap-3">
          <Text className="text-gray-600 text-right flex-1">{user?.employee_id}</Text>
          <Text className="text-gray-800 font-medium w-24 text-right">מספר עובד</Text>
          <Hash size={18} color="#9ca3af" />
        </View>

        {/* Phone placeholder (assuming phone isn't in JWT, adjust if needed) */}
        <View className="flex-row items-center justify-end py-3 gap-3">
          <Text className="text-gray-600 text-right flex-1">לא מוגדר במערכת</Text>
          <Text className="text-gray-800 font-medium w-24 text-right">טלפון</Text>
          <Phone size={18} color="#9ca3af" />
        </View>
      </View>

      {/* Logout Button */}
      <TouchableOpacity 
        onPress={handleLogout}
        className="flex-row items-center justify-center bg-red-50 py-4 rounded-xl border border-red-100"
      >
        <Text className="text-red-600 font-bold text-lg mr-2">התנתק מהמערכת</Text>
        <LogOut size={20} color="#dc2626" />
      </TouchableOpacity>
      
      {/* App Version Info */}
      <Text className="text-center text-gray-400 text-xs mt-8">
        Auto Shift Mobile v1.0.0
      </Text>
    </ScrollView>
  );
}