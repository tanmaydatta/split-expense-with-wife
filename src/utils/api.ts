import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { ApiEndpoints, TypedApiClient } from '../../shared-types';

// Create axios instance with common base URL from environment variables
const apiInstance: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/.netlify/functions',
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '10000', 10),
  withCredentials: true, // This is required to send cookies with cross-origin requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: Add request interceptor for common behavior
apiInstance.interceptors.request.use(
  (config) => {
    // Get token from local storage
    const token = localStorage.getItem('sessionToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: Add response interceptor for common error handling
apiInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // You can add common error handling here
    return Promise.reject(error);
  }
);

// Type-safe API client implementation
class TypeSafeApiClient implements TypedApiClient {
  async post<K extends keyof ApiEndpoints>(
    endpoint: K,
    data: ApiEndpoints[K]['request']
  ): Promise<ApiEndpoints[K]['response']> {
    try {
      const response: AxiosResponse<ApiEndpoints[K]['response']> = await apiInstance.post(
        endpoint as string,
        data
      );
      return response.data;
    } catch (error) {
      // Re-throw error to maintain error handling behavior
      throw error;
    }
  }
}

// Create and export the typed API client
export const typedApi = new TypeSafeApiClient();

// Export the raw axios instance for backwards compatibility
export default apiInstance; 