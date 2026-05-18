import { describe, expect, it } from 'vitest';
import { compareHlc, nextHlc } from './hlc';
import { mergeSyncChange } from './merge';
import type { SyncChange, SyncRecordData } from './types';

const nowIso = '2026-05-17T10:00:00.000Z';

describe('hybrid logical clock', () => {
  it('orders by wall time, counter, then device id', () => {
    expect(compareHlc('10-0-a', '9-99-z')).toBe(1);
    expect(compareHlc('10-2-a', '10-1-z')).toBe(1);
    expect(compareHlc('10-1-b', '10-1-a')).toBe(1);
  });

  it('increments the counter when local time does not advance', () => {
    expect(nextHlc('1000-0-device-a', 'device-a', 999)).toBe('1000-1-device-a');
  });
});

describe('mergeSyncChange', () => {
  it('merges different fields without conflict', () => {
    const current = record({
      data: { name: 'Anna Keller', phone: '111' },
      field_versions_json: { name: '1000-0-a', phone: '1000-0-a' },
      version_hlc: '1000-0-a'
    });
    const change = syncChange({
      fields: { phone: '222' },
      field_versions: { phone: '2000-0-b' },
      version_hlc: '2000-0-b'
    });

    const result = mergeSyncChange(current, change, nowIso);

    expect(result.record.data).toEqual({ name: 'Anna Keller', phone: '222' });
    expect(result.conflicts).toHaveLength(0);
  });

  it('lets tombstones win over stale updates', () => {
    const current = record({
      deleted_at: '2026-05-17T09:00:00.000Z',
      version_hlc: '3000-0-a'
    });
    const change = syncChange({
      fields: { name: 'Changed offline' },
      version_hlc: '2000-0-b'
    });

    const result = mergeSyncChange(current, change, nowIso);

    expect(result.ignored).toBe(true);
    expect(result.conflicts[0].strategy).toBe('tombstone_wins');
  });

  it('logs deterministic conflicts for exact HLC ties on one field', () => {
    const current = record({
      data: { name: 'Server' },
      field_versions_json: { name: '1000-0-device-a' },
      version_hlc: '1000-0-device-a',
      device_id: 'device-a'
    });
    const change = syncChange({
      fields: { name: 'Client' },
      field_versions: { name: '1000-0-device-a' },
      version_hlc: '1000-0-device-a',
      device_id: 'device-b'
    });

    const result = mergeSyncChange(current, change, nowIso);

    expect(result.record.data.name).toBe('Client');
    expect(result.conflicts[0]).toMatchObject({
      field_name: 'name',
      strategy: 'lww_tie_break_device_id',
      status: 'open'
    });
  });
});

function record(overrides: Partial<SyncRecordData> = {}): SyncRecordData {
  return {
    entity: 'employee',
    id: 'employee-1',
    data: { name: 'Anna Keller' },
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    version_hlc: '1000-0-device-a',
    device_id: 'device-a',
    user_id: null,
    field_versions_json: { name: '1000-0-device-a' },
    ...overrides
  };
}

function syncChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    op_id: 'op-1',
    entity: 'employee',
    id: 'employee-1',
    operation: 'upsert',
    base_version: null,
    version_hlc: '2000-0-device-b',
    updated_at: nowIso,
    deleted_at: null,
    device_id: 'device-b',
    user_id: null,
    fields: { name: 'Client' },
    field_versions: { name: '2000-0-device-b' },
    ...overrides
  };
}
