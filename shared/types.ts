export interface User {
  _id: string;
  email: string;
  role: 'shipper' | 'driver' | 'fleet-manager' | 'broker' | 'admin';
  name: string;
  phone: string;
  isEmailVerified: boolean;
}

export interface Vehicle {
  _id: string;
  ownerId: string;
  brokerId?: string;
  vehicleNumber: string;
  vehicleCategory: 'bike' | '3_wheeler' | 'mini_truck' | 'pickup' | 'lcv' | 'mcv' | 'hcv' | 'trailer' | 'container' | '20_tyre' | '50_ton';
  bodyType: string;
  capacityTon: number;
  capacityKg: number;
  wheelCount: number;
  containerLength?: number;
  currentLocation: { lat: number; lng: number; address: string };
  availabilityStatus: 'available' | 'busy' | 'on_trip' | 'offline';
  emptyTruckStatus: 'empty' | 'partially_loaded' | 'full';
  currentRoute?: { from: string; to: string; waypoints: { lat: number; lng: number }[] };
}

export interface Load {
  _id: string;
  shipperId: string;
  pickupLocation: { lat: number; lng: number; address: string; city: string; state: string };
  dropLocation: { lat: number; lng: number; address: string; city: string; state: string };
  loadWeight: number;
  loadType: string;
  vehicleRequired: string;
  bodyType: string;
  scheduleTime: string;
  price?: number;
  bidMode: boolean;
  urgent: boolean;
  status: 'posted' | 'matched' | 'booked' | 'in_transit' | 'delivered' | 'cancelled';
  matchedVehicles: string[];
}

export interface Notification {
  _id: string;
  type: 'load_match' | 'vehicle_available' | 'booking_update' | 'trip_update';
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: User['role'];
  name: string;
  phone?: string;
  gstin?: string;
}

export interface PostLoadRequest {
  pickupLocation: Load['pickupLocation'];
  dropLocation: Load['dropLocation'];
  loadWeight: number;
  loadType: string;
  vehicleRequired: string;
  bodyType: string;
  scheduleTime: string;
  price?: number;
  bidMode: boolean;
  urgent: boolean;
}

export interface UpdateVehicleRequest {
  availabilityStatus: Vehicle['availabilityStatus'];
  emptyTruckStatus: Vehicle['emptyTruckStatus'];
  currentLocation: Vehicle['currentLocation'];
  currentRoute?: Vehicle['currentRoute'];
}