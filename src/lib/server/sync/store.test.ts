import { describe, expect, it } from 'vitest';
import { MemorySyncStore } from './store';

describe('MemorySyncStore', () => {
  it('accepts idempotent push operations and returns cursor deltas', async () => {
    const store = new MemorySyncStore();
    const change = {
      op_id: 'op-1',
      entity: 'employee' as const,
      id: 'employee-1',
      operation: 'upsert' as const,
      base_version: null,
      version_hlc: '1000-0-device-a',
      updated_at: '2026-05-17T10:00:00.000Z',
      deleted_at: null,
      device_id: 'device-a',
      user_id: null,
      fields: { name: 'Anna Keller' },
      field_versions: { name: '1000-0-device-a' }
    };

    const firstPush = await store.push('device-a', [change]);
    const secondPush = await store.push('device-a', [change]);
    const initialPull = await store.pull('device-b', null, 50);
    const deltaPull = await store.pull('device-b', '0', 50);

    expect(firstPush.accepted).toEqual(['op-1']);
    expect(secondPush.accepted).toEqual(['op-1']);
    expect(initialPull.changes).toHaveLength(1);
    expect(deltaPull.changes).toHaveLength(1);
  });
});
