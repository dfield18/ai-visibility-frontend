import {
  SuggestRequest,
  SuggestResponse,
  RunConfig,
  RunResponse,
  RunStatusResponse,
  CancelResponse,
  ApiError,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        detail: `Request failed with status ${response.status}`,
      }));
      throw new Error(error.detail);
    }

    return response.json();
  }

  async getSuggestions(brand: string, industry?: string): Promise<SuggestResponse> {
    const body: SuggestRequest = { brand };
    if (industry) {
      body.industry = industry;
    }

    return this.request<SuggestResponse>('/api/v1/suggest', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async startRun(config: RunConfig): Promise<RunResponse> {
    return this.request<RunResponse>('/api/v1/run', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async getRunStatus(runId: string): Promise<RunStatusResponse> {
    return this.request<RunStatusResponse>(`/api/v1/run/${runId}`);
  }

  async cancelRun(runId: string): Promise<CancelResponse> {
    return this.request<CancelResponse>(`/api/v1/run/${runId}/cancel`, {
      method: 'POST',
    });
  }
}

export const api = new ApiClient(API_BASE);

export { API_BASE };
