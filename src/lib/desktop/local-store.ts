import { invoke } from '@tauri-apps/api/core';

export interface LocalStoreStatus {
  database_path: string;
  schema_version: number;
  pending_outbox_count: number;
  open_conflict_count: number;
}

export interface InitLocalStoreInput {
  device_id: string;
  user_id?: string | null;
}

export async function initLocalStore(input: InitLocalStoreInput): Promise<LocalStoreStatus> {
  return invoke<LocalStoreStatus>('init_local_store', { ...input });
}

export async function getLocalStoreStatus(): Promise<LocalStoreStatus> {
  return invoke<LocalStoreStatus>('get_local_store_status');
}

export async function saveAuthToken(token: string): Promise<void> {
  await invoke('save_auth_token', { token });
}

export async function loadAuthToken(): Promise<string | null> {
  return invoke<string | null>('load_auth_token');
}
