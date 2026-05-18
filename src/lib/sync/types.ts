import { z } from 'zod';

export const syncEntitySchema = z.enum(['client', 'employee', 'appointment', 'planner_settings']);
export const syncOperationSchema = z.enum(['upsert', 'delete', 'restore']);

export type SyncEntity = z.infer<typeof syncEntitySchema>;
export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const fieldVersionsSchema = z.record(z.string(), z.string());

export const syncChangeSchema = z.object({
  op_id: z.string().min(1),
  entity: syncEntitySchema,
  id: z.string().min(1),
  operation: syncOperationSchema,
  base_version: z.string().nullable().optional(),
  version_hlc: z.string().min(1),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable().optional(),
  device_id: z.string().min(1),
  user_id: z.string().nullable().optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
  field_versions: fieldVersionsSchema.default({})
});

export const syncPushRequestSchema = z.object({
  device_id: z.string().min(1),
  changes: z.array(syncChangeSchema).max(500)
});

export const syncPullRequestSchema = z.object({
  device_id: z.string().min(1),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(1000).default(200)
});

export const conflictResolutionSchema = z.object({
  status: z.enum(['resolved', 'ignored']),
  chosen_fields: z.record(z.string(), z.unknown()).default({})
});

export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export type SyncPullRequest = z.infer<typeof syncPullRequestSchema>;
export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

export interface SyncRecordData {
  entity: SyncEntity;
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version_hlc: string;
  device_id: string;
  user_id: string | null;
  field_versions_json: Record<string, string>;
}

export interface SyncConflictData {
  id: string;
  entity: SyncEntity;
  record_id: string;
  field_name: string;
  local_value: unknown;
  server_value: unknown;
  chosen_value: unknown;
  strategy: string;
  op_id: string;
  status: 'open' | 'resolved' | 'ignored';
  created_at: string;
  resolved_at: string | null;
}

export interface SyncPushResult {
  accepted: string[];
  rejected: Array<{ op_id: string; reason: string }>;
  conflicts: SyncConflictData[];
  cursor: string;
}

export interface SyncPullResult {
  next_cursor: string;
  has_more: boolean;
  changes: SyncRecordData[];
}
