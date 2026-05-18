import { retryDelayMs } from './backoff';
import type { SyncChange, SyncConflictData, SyncPullResult, SyncPushResult } from './types';

export interface SyncHttpClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface SyncRunInput {
  deviceId: string;
  cursor: string | null;
  pendingChanges: SyncChange[];
  limit?: number;
}

export interface SyncRunResult {
  push: SyncPushResult;
  pull: SyncPullResult;
  conflicts: SyncConflictData[];
  retryAfterMs: number | null;
}

export class SyncHttpClient {
  private fetchImpl: typeof fetch;

  constructor(private options: SyncHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async runOnce(input: SyncRunInput, attempt = 0): Promise<SyncRunResult> {
    try {
      const push = await this.post<SyncPushResult>('/sync/push', {
        device_id: input.deviceId,
        changes: input.pendingChanges
      });
      const pull = await this.post<SyncPullResult>('/sync/pull', {
        device_id: input.deviceId,
        cursor: input.cursor,
        limit: input.limit ?? 200
      });
      const conflictPayload = await this.get<{ conflicts: SyncConflictData[] }>('/sync/conflicts?status=open');

      return {
        push,
        pull,
        conflicts: conflictPayload.conflicts,
        retryAfterMs: null
      };
    } catch (error) {
      return {
        push: { accepted: [], rejected: [], conflicts: [], cursor: input.cursor ?? '0' },
        pull: { changes: [], has_more: false, next_cursor: input.cursor ?? '0' },
        conflicts: [],
        retryAfterMs: retryDelayMs({ attempt })
      };
    }
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      headers: this.headers()
    });
    return this.readJson<T>(response);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body)
    });
    return this.readJson<T>(response);
  }

  private async readJson<T>(response: Response): Promise<T> {
    const payload = (await response.json()) as T;
    if (!response.ok) {
      throw new Error(`Sync request failed with HTTP ${response.status}`);
    }
    return payload;
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    return {
      ...extra,
      ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {})
    };
  }

  private url(path: string): string {
    return new URL(path, this.options.baseUrl).toString();
  }
}
