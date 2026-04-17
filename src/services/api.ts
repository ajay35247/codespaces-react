import { ApiResponse } from '../../../shared/types';
import { getApiErrorMessage, getApiOrigin, parseApiBody } from '../utils/api';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiService {
  private baseURL: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<void> | null = null;

  constructor(baseURL: string = `${getApiOrigin()}/api`) {
    this.baseURL = baseURL.endsWith('/api') ? baseURL : `${baseURL.replace(/\/+$/, '')}/api`;
    this.token = localStorage.getItem('authToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('authToken', token);
  }

  setRefreshToken(token: string) {
    this.refreshToken = token;
    localStorage.setItem('refreshToken', token);
  }

  clearToken() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
  }

  private async tryRefresh(): Promise<void> {
    if (!this.refreshToken) throw new Error('No refresh token');
    const res = await fetch(`${this.baseURL}/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await parseApiBody(res);
    this.setToken(data.token);
    this.setRefreshToken(data.refreshToken);
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
      const responseBody = await parseApiBody(response);

      if (response.status === 401) {
        // Token expired – try silent refresh once
        if (responseBody?.code === 'TOKEN_EXPIRED' && retryCount === 0 && this.refreshToken) {
          if (!this.refreshPromise) {
            this.refreshPromise = this.tryRefresh().finally(() => { this.refreshPromise = null; });
          }
          try {
            await this.refreshPromise;
            return this.request<T>(endpoint, options, retryCount + 1);
          } catch {
            this.clearToken();
            window.location.href = '/login';
            throw new ApiError(401, 'Session expired');
          }
        }
        this.clearToken();
        window.location.href = '/login';
        throw new ApiError(401, getApiErrorMessage(responseBody, 'Unauthorized'), responseBody);
      }

      if (!response.ok) {
        throw new ApiError(response.status, getApiErrorMessage(responseBody, 'Request failed'), responseBody);
      }

      return responseBody as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      // Retry on transient network errors (max 3 attempts with exponential backoff)
      if (retryCount < 3 && (error instanceof TypeError || (error as Error).message?.includes('fetch'))) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      throw new ApiError(0, 'Network error', error);
    }
  }

  // Auth methods
  async login(email: string, password: string): Promise<{ user: any; token: string; refreshToken: string }> {
    const response = await this.request<{ user: any; token: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response?.token) {
      this.setToken(response.token);
    }
    if (response?.refreshToken) {
      this.setRefreshToken(response.refreshToken);
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    role: string;
    name: string;
    phone: string;
  }): Promise<{ user: any; token: string; refreshToken: string }> {
    const response = await this.request<{ user: any; token: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response?.token) {
      this.setToken(response.token);
    }
    if (response?.refreshToken) {
      this.setRefreshToken(response.refreshToken);
    }

    return response;
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    }).catch(() => {});
    this.clearToken();
  }

  async getProfile(): Promise<any> {
    return this.request<any>('/auth/me');
  }

  // Vehicle methods
  async getVehicles(): Promise<any[]> {
    return this.request<any[]>('/vehicles');
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