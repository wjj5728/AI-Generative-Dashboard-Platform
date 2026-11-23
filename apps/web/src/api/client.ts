import type {
  AIEditDashboardRequest,
  AIEditDashboardResponse,
  ApiResponse,
  ComponentMetadata,
  DashboardDetail,
  DashboardRevisionDetail,
  DashboardRevisionSummary,
  DashboardSummary,
  DataSourceMetadata,
  GenerateDashboardRequest,
  GenerateDashboardResponse,
  GenerateStreamCompleteEvent,
  GenerateStreamErrorEvent,
  GenerateStreamMetaEvent,
  GenerateStreamPatchEvent,
  GenerateStreamStageEvent,
  QueryBatchItem,
  QueryBatchResponse,
  RollbackDashboardRequest,
  SaveDashboardRequest,
  UpdateDashboardRequest,
} from '@ai-dashboard/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!res.ok || !payload || !payload.ok) {
    const err = payload && !payload.ok ? payload.error : null;
    throw new ApiClientError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed with status ${res.status}`,
      err?.details,
    );
  }
  return payload.data;
}

export const apiClient = {
  async listDashboards(): Promise<DashboardSummary[]> {
    const data = await requestJson<{ dashboards: DashboardSummary[] }>('/api/dashboards');
    return data.dashboards;
  },

  async getDashboard(id: string): Promise<DashboardDetail> {
    const data = await requestJson<{ dashboard: DashboardDetail }>(`/api/dashboards/${id}`);
    return data.dashboard;
  },

  async createDashboard(body: SaveDashboardRequest): Promise<DashboardDetail> {
    const data = await requestJson<{ dashboard: DashboardDetail }>('/api/dashboards', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data.dashboard;
  },

  async updateDashboard(
    id: string,
    body: UpdateDashboardRequest,
  ): Promise<DashboardDetail> {
    const data = await requestJson<{ dashboard: DashboardDetail }>(
      `/api/dashboards/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    return data.dashboard;
  },

  async deleteDashboard(id: string): Promise<void> {
    await requestJson<{ deleted: boolean }>(`/api/dashboards/${id}`, {
      method: 'DELETE',
    });
  },

  async generateDashboard(
    body: GenerateDashboardRequest,
  ): Promise<GenerateDashboardResponse> {
    return requestJson<GenerateDashboardResponse>('/api/dashboards/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async generateDashboardStream(
    body: GenerateDashboardRequest,
    callbacks: {
      onStage?: (evt: GenerateStreamStageEvent) => void;
      onMeta?: (evt: GenerateStreamMetaEvent) => void;
      onPatch?: (evt: GenerateStreamPatchEvent) => void;
      onComplete?: (evt: GenerateStreamCompleteEvent) => void;
      onError?: (evt: GenerateStreamErrorEvent) => void;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await fetch('/api/dashboards/generate-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      const err = payload && !payload.ok ? payload.error : null;
      throw new ApiClientError(
        res.status,
        err?.code ?? 'HTTP_ERROR',
        err?.message ?? `SSE request failed with status ${res.status}`,
        err?.details,
      );
    }

    if (!res.body) {
      throw new ApiClientError(500, 'STREAM_UNAVAILABLE', 'Readable stream is not available.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const dispatchBlock = (rawBlock: string) => {
      const lines = rawBlock.split(/\r?\n/);
      let eventType = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;
        if (line.startsWith('event:')) {
          eventType = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice('data:'.length).trimStart());
        }
      }

      if (dataLines.length === 0) return;
      const parsed = JSON.parse(dataLines.join('\n'));

      switch (eventType) {
        case 'stage':
          callbacks.onStage?.(parsed as GenerateStreamStageEvent);
          break;
        case 'meta':
          callbacks.onMeta?.(parsed as GenerateStreamMetaEvent);
          break;
        case 'patch':
          callbacks.onPatch?.(parsed as GenerateStreamPatchEvent);
          break;
        case 'complete':
          callbacks.onComplete?.(parsed as GenerateStreamCompleteEvent);
          break;
        case 'error':
          callbacks.onError?.(parsed as GenerateStreamErrorEvent);
          break;
        default:
          break;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundaryIdx = buffer.indexOf('\n\n');
        while (boundaryIdx !== -1) {
          const block = buffer.slice(0, boundaryIdx).trim();
          buffer = buffer.slice(boundaryIdx + 2);
          if (block) {
            dispatchBlock(block);
          }
          boundaryIdx = buffer.indexOf('\n\n');
        }
      }
      const trailing = buffer.trim();
      if (trailing) {
        dispatchBlock(trailing);
      }
    } finally {
      reader.releaseLock();
    }
  },

  async aiEditDashboard(
    id: string,
    body: AIEditDashboardRequest,
  ): Promise<AIEditDashboardResponse> {
    return requestJson<AIEditDashboardResponse>(`/api/dashboards/${id}/ai-edit`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async publishDashboard(id: string): Promise<DashboardDetail> {
    const data = await requestJson<{ dashboard: DashboardDetail }>(
      `/api/dashboards/${id}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
    return data.dashboard;
  },

  async listRevisions(id: string): Promise<DashboardRevisionSummary[]> {
    const data = await requestJson<{ revisions: DashboardRevisionSummary[] }>(
      `/api/dashboards/${id}/revisions`,
    );
    return data.revisions;
  },

  async getRevision(id: string, revision: number): Promise<DashboardRevisionDetail> {
    const data = await requestJson<{ revision: DashboardRevisionDetail }>(
      `/api/dashboards/${id}/revisions/${revision}`,
    );
    return data.revision;
  },

  async rollbackDashboard(
    id: string,
    body: RollbackDashboardRequest,
  ): Promise<DashboardDetail> {
    const data = await requestJson<{ dashboard: DashboardDetail }>(
      `/api/dashboards/${id}/rollback`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    return data.dashboard;
  },

  async getComponentCatalog(): Promise<{
    contractVersion: string;
    catalogVersion: string;
    components: ComponentMetadata[];
  }> {
    return requestJson('/api/catalog/components');
  },

  async getDataSourceCatalog(): Promise<{ datasources: DataSourceMetadata[] }> {
    return requestJson('/api/catalog/datasources');
  },

  async queryBatch(
    queries: QueryBatchItem[],
    options?: { bypassCache?: boolean },
  ): Promise<QueryBatchResponse> {
    return requestJson<QueryBatchResponse>('/api/data/query-batch', {
      method: 'POST',
      body: JSON.stringify({
        queries,
        ...(options?.bypassCache ? { bypassCache: true } : {}),
      }),
    });
  },
};
