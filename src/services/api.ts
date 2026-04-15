import { ApiResponse } from '../../../shared/types';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiService {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = import.meta.env.VITE_API_URL || 'http://localhost:5000/api') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('authToken');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('authToken');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (this.token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.token}`,
      };
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        this.clearToken();
        window.location.href = '/login';
        throw new ApiError(401, 'Unauthorized');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(response.status, errorData.message || 'Request failed', errorData);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Retry logic for network errors
      if (retryCount < 3 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      throw new ApiError(0, 'Network error', error);
    }
  }

  // Auth methods
  async login(email: string, password: string): Promise<ApiResponse<{ user: any; token: string }>> {
    const response = await this.request<ApiResponse<{ user: any; token: string }>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    role: string;
    name: string;
    phone: string;
  }): Promise<ApiResponse<{ user: any; token: string }>> {
    const response = await this.request<ApiResponse<{ user: any; token: string }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response.data?.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async getProfile(): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/auth/me');
  }

  // Vehicle methods
  async getVehicles(): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>('/vehicles');
  }

  async createVehicle(vehicleData: any): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleData),
    });
  }

  async updateVehicle(id: string, updates: any): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Load methods
  async getLoads(page = 1, limit = 20): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/loads?page=${page}&limit=${limit}`);
  }

  async createLoad(loadData: any): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/loads', {
      method: 'POST',
      body: JSON.stringify(loadData),
    });
  }

  async getMatchingVehicles(loadId: string): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/loads/${loadId}/matching-vehicles`);
  }

  // Notification methods
  async getNotifications(page = 1, limit = 20): Promise<ApiResponse<any[]>> {
    return this.request<ApiResponse<any[]>>(`/notifications?page=${page}&limit=${limit}`);
  }

  async markNotificationRead(id: string): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsRead(): Promise<ApiResponse<any>> {
    return this.request<ApiResponse<any>>('/notifications/mark-all-read', {
      method: 'PUT',
    });
  }
}

export const apiService = new ApiService();
export { ApiError };