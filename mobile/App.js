import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet } from 'react-native';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createStackNavigator();
const API_URL = 'http://localhost:5000'; // Update for production
const socket = io(API_URL);

const HomeScreen = () => {
  const [userId, setUserId] = React.useState(null);
  const [notifications, setNotifications] = React.useState([]);

  React.useEffect(() => {
    const getUserData = async () => {
      try {
        const token = await AsyncStorage.getItem('authToken');
        const user = await AsyncStorage.getItem('user');
        if (user) {
          const userData = JSON.parse(user);
          setUserId(userData.id);
          socket.emit('join', userData.id);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    getUserData();

    socket.on('notification', (notification) => {
      console.log('New notification:', notification);
      setNotifications(prev => [notification, ...prev]);
      // Show local notification
    });

    return () => {
      socket.off('notification');
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Speedy Trucks Mobile</Text>
      <Text style={styles.subtitle}>
        Connected: {socket.connected ? 'Yes' : 'No'}
      </Text>
      <Text style={styles.subtitle}>
        Notifications: {notifications.length}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
};

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Speedy Trucks' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
});