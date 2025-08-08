import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import type { ApiEndpoints, ErrorResponse, TypedApiClient } from "split-expense-shared-types";

// Custom error class for API errors that includes the ErrorResponse
export class ApiError extends Error {
	public statusCode: number;
	public errorMessage: string;

	constructor(errorResponse: ErrorResponse) {
		super(errorResponse.error);
		this.statusCode = errorResponse.statusCode;
		this.errorMessage = errorResponse.error;
		this.name = "ApiError";
	}
}

// Create axios instance with common base URL from environment variables
const apiInstance: AxiosInstance = axios.create({
	baseURL: process.env.REACT_APP_API_BASE_URL || "/.netlify/functions",
	timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || "10000", 10),
	withCredentials: true, // This is required to send cookies with cross-origin requests
	headers: {
		"Content-Type": "application/json",
	},
});

// Optional: Add request interceptor for common behavior
apiInstance.interceptors.request.use(
	(config) => {
		// Get token from local storage
		const token = localStorage.getItem("sessionToken");
		if (token) {
			config.headers.Authorization = `Bearer ${token}`;
		}
		return config;
	},
	(error) => {
		return Promise.reject(error);
	},
);

// Optional: Add response interceptor for common error handling
apiInstance.interceptors.response.use(
	(response) => {
		return response;
	},
	(error) => {
		// Handle 401 Unauthorized globally
		if (error.response?.status === 401) {
			// Dynamically import to avoid circular dependency
			import("@/utils/auth").then(({ logout }) => {
				console.log("Unauthorized access detected. Logging out...");
				logout();
			});
		}

		return Promise.reject(error);
	},
);

// Type-safe API client implementation
class TypeSafeApiClient implements TypedApiClient {
	async post<K extends keyof ApiEndpoints>(
		endpoint: K,
		data: ApiEndpoints[K]["request"],
	): Promise<ApiEndpoints[K]["response"]> {
		try {
			const response: AxiosResponse<ApiEndpoints[K]["response"]> =
				await apiInstance.post(endpoint as string, data);
			return response.data;
		} catch (error) {
			return this.handleError(error);
		}
	}

	async get<K extends keyof ApiEndpoints>(
		endpoint: K,
	): Promise<ApiEndpoints[K]["response"]> {
		try {
			const response: AxiosResponse<ApiEndpoints[K]["response"]> =
				await apiInstance.get(endpoint as string);
			return response.data;
		} catch (error) {
			return this.handleError(error);
		}
	}

  async delete<K extends keyof ApiEndpoints>(
    endpoint: K,
    data?: ApiEndpoints[K]["request"],
  ): Promise<ApiEndpoints[K]["response"]> {
		try {
      const response: AxiosResponse<ApiEndpoints[K]["response"]> =
        await apiInstance.delete(endpoint as string, { data });
			return response.data;
		} catch (error) {
			return this.handleError(error);
		}
	}

	private handleError(error: unknown): never {
		// Handle axios errors and convert to our typed ApiError
		if (axios.isAxiosError(error)) {
			const axiosError = error as AxiosError<ErrorResponse>;

			// If the server returned an ErrorResponse, use it
			if (
				axiosError.response?.data &&
				typeof axiosError.response.data === "object" &&
				"error" in axiosError.response.data
			) {
				throw new ApiError(axiosError.response.data);
			}

			// Otherwise, create an ErrorResponse from the axios error
			const errorResponse: ErrorResponse = {
				error: axiosError.message || "Network error occurred",
				statusCode: axiosError.response?.status || 500,
			};
			throw new ApiError(errorResponse);
		}

		// For non-axios errors, create a generic error response
		const errorResponse: ErrorResponse = {
			error: error instanceof Error ? error.message : "Unknown error occurred",
			statusCode: 500,
		};
		throw new ApiError(errorResponse);
	}
}

// Create and export the typed API client
export const typedApi = new TypeSafeApiClient();

// Export the raw axios instance for backwards compatibility
export default apiInstance;
