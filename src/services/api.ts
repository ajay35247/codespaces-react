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
  private refreshPromise: Promise<void> | null = null;

  constructor(baseURL: string = `${getApiOrigin()}/api`) {
    this.baseURL = baseURL.endsWith('/api') ? baseURL : `${baseURL.replace(/\/+$/, '')}/api`;
  }

  clearToken() {
    return undefined;
  }

  private async tryRefresh(): Promise<void> {
    const res = await fetch(`${this.baseURL}/auth/refresh-token`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Refresh failed');
    await parseApiBody(res);
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

    config.credentials = 'include';

    try {
      const response = await fetch(url, config);
      const responseBody = await parseApiBody(response);

      if (response.status === 401) {
        // Token expired – try silent refresh once
        if (responseBody?.code === 'TOKEN_EXPIRED' && retryCount === 0) {
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
  async login(email: string, password: string): Promise<{ user: any }> {
    return this.request<{ user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(userData: {
    email: string;
    password: string;
    role: string;
    name: string;
    phone?: string;
    gstin?: string;
  }): Promise<{ user: any; message?: string }> {
    return this.request<{ user: any; message?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
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