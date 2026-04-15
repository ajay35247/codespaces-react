import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text } from 'react-native';
import io from 'socket.io-client';

const Stack = createStackNavigator();
const socket = io('http://localhost:5000'); // Backend URL

const HomeScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <Text>Speedy Trucks Mobile App</Text>
  </View>
);

export default function App() {
  React.useEffect(() => {
    socket.on('notification', (notification) => {
      console.log('New notification:', notification);
      // Handle notification
    });

    return () => socket.disconnect();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}