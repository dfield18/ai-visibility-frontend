import {
  SuggestRequest,
  SuggestResponse,
  RunConfig,
  RunResponse,
  RunStatusResponse,
  CancelResponse,
  AISummaryResponse,
  CategorizeRequest,
  CategorizeResponse,
  ApiError,
  ScheduledReport,
  ScheduledReportCreate,
  ScheduledReportUpdate,
  ScheduledReportListResponse,
  ToggleResponse,
  RunNowResponse,
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

    // Handle empty responses (e.g., 204 No Content from DELETE requests)
    const contentLength = response.headers.get('content-length');
    if (response.status === 204 || contentLength === '0') {
      return undefined as T;
    }

    // Try to parse JSON, return undefined if empty
    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text);
  }

  async getSuggestions(brand: string, searchType: 'brand' | 'category' = 'brand', industry?: string): Promise<SuggestResponse> {
    const body: SuggestRequest = { brand, search_type: searchType };
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

  async getAISummary(runId: string): Promise<AISummaryResponse> {
    return this.request<AISummaryResponse>(`/api/v1/run/${runId}/ai-summary`);
  }

  async categorizeDomains(domains: string[]): Promise<CategorizeResponse> {
    const body: CategorizeRequest = { domains };
    return this.request<CategorizeResponse>('/api/v1/categorize', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Scheduled Reports API

  async listScheduledReports(token: string): Promise<ScheduledReportListResponse> {
    return this.request<ScheduledReportListResponse>('/api/v1/scheduled-reports', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async createScheduledReport(data: ScheduledReportCreate, token: string): Promise<ScheduledReport> {
    return this.request<ScheduledReport>('/api/v1/scheduled-reports', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
  }

  async getScheduledReport(reportId: string, token: string): Promise<ScheduledReport> {
    return this.request<ScheduledReport>(`/api/v1/scheduled-reports/${reportId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async updateScheduledReport(reportId: string, data: ScheduledReportUpdate, token: string): Promise<ScheduledReport> {
    return this.request<ScheduledReport>(`/api/v1/scheduled-reports/${reportId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
  }

  async deleteScheduledReport(reportId: string, token: string): Promise<void> {
    await this.request<void>(`/api/v1/scheduled-reports/${reportId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async toggleScheduledReport(reportId: string, token: string): Promise<ToggleResponse> {
    return this.request<ToggleResponse>(`/api/v1/scheduled-reports/${reportId}/toggle`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }

  async runScheduledReportNow(reportId: string, token: string): Promise<RunNowResponse> {
    return this.request<RunNowResponse>(`/api/v1/scheduled-reports/${reportId}/run-now`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
  }
}

export const api = new ApiClient(API_BASE);

export { API_BASE };
