import postgres from 'postgres';
import { mergeSyncChange } from '$lib/sync/merge';
import type {
  ConflictResolution,
  SyncChange,
  SyncConflictData,
  SyncPullResult,
  SyncPushResult,
  SyncRecordData
} from '$lib/sync/types';

export interface SyncStore {
  push(deviceId: string, changes: SyncChange[]): Promise<SyncPushResult>;
  pull(deviceId: string, cursor: string | null | undefined, limit: number): Promise<SyncPullResult>;
  listConflicts(status?: string): Promise<SyncConflictData[]>;
  resolveConflict(id: string, resolution: ConflictResolution): Promise<SyncConflictData | null>;
}

let singleton: SyncStore | null = null;

export function getSyncStore(): SyncStore {
  singleton ??= process.env.DATABASE_URL ? new PostgresSyncStore(process.env.DATABASE_URL) : new MemorySyncStore();
  return singleton;
}

export class MemorySyncStore implements SyncStore {
  private records = new Map<string, SyncRecordData>();
  private conflicts = new Map<string, SyncConflictData>();
  private operations = new Set<string>();
  private events: Array<{ seq: number; deviceId: string; opId: string; record: SyncRecordData }> = [];
  private seq = 0;

  async push(_deviceId: string, changes: SyncChange[]): Promise<SyncPushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ op_id: string; reason: string }> = [];
    const conflicts: SyncConflictData[] = [];

    for (const change of changes) {
      const operationKey = `${change.device_id}:${change.op_id}`;
      if (this.operations.has(operationKey)) {
        accepted.push(change.op_id);
        continue;
      }

      try {
        const recordKey = this.recordKey(change.entity, change.id);
        const current = this.records.get(recordKey) ?? null;
        const decision = mergeSyncChange(current, change);

        this.records.set(recordKey, decision.record);
        for (const conflict of decision.conflicts) {
          this.conflicts.set(conflict.id, conflict);
          conflicts.push(conflict);
        }

        this.operations.add(operationKey);
        this.seq += 1;
        this.events.push({
          seq: this.seq,
          deviceId: change.device_id,
          opId: change.op_id,
          record: decision.record
        });
        accepted.push(change.op_id);
      } catch (error) {
        rejected.push({
          op_id: change.op_id,
          reason: error instanceof Error ? error.message : 'Change could not be applied.'
        });
      }
    }

    return { accepted, rejected, conflicts, cursor: String(this.seq) };
  }

  async pull(_deviceId: string, cursor: string | null | undefined, limit: number): Promise<SyncPullResult> {
    if (!cursor) {
      const changes = Array.from(this.records.values()).slice(0, limit);
      return {
        changes,
        next_cursor: String(this.seq),
        has_more: changes.length < this.records.size
      };
    }

    const fromSeq = Number(cursor);
    const events = this.events.filter((event) => event.seq > fromSeq).slice(0, limit);
    const lastSeq = events.at(-1)?.seq ?? fromSeq;

    return {
      changes: events.map((event) => event.record),
      next_cursor: String(lastSeq),
      has_more: this.events.some((event) => event.seq > lastSeq)
    };
  }

  async listConflicts(status = 'open'): Promise<SyncConflictData[]> {
    return Array.from(this.conflicts.values()).filter((conflict) => conflict.status === status);
  }

  async resolveConflict(id: string, resolution: ConflictResolution): Promise<SyncConflictData | null> {
    const conflict = this.conflicts.get(id);
    if (!conflict) return null;

    const updated: SyncConflictData = {
      ...conflict,
      chosen_value:
        Object.keys(resolution.chosen_fields).length > 0 ? resolution.chosen_fields[conflict.field_name] : conflict.chosen_value,
      status: resolution.status,
      resolved_at: new Date().toISOString()
    };
    this.conflicts.set(id, updated);
    return updated;
  }

  private recordKey(entity: string, id: string): string {
    return `${entity}:${id}`;
  }
}

class PostgresSyncStore implements SyncStore {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 10 });
  }

  async push(_deviceId: string, changes: SyncChange[]): Promise<SyncPushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ op_id: string; reason: string }> = [];
    const conflicts: SyncConflictData[] = [];

    for (const change of changes) {
      const result = await this.sql.begin(async (tx) => {
        const existingOperation = await tx`
          select status from sync_operations
          where device_id = ${change.device_id} and op_id = ${change.op_id}
          limit 1
        `;
        if (existingOperation.length > 0) {
          return { status: 'accepted' as const, conflicts: [] as SyncConflictData[], record: null as SyncRecordData | null };
        }

        const currentRows = await tx`
          select entity, id, data, created_at, updated_at, deleted_at, version_hlc, device_id, user_id, field_versions_json
          from sync_records
          where entity = ${change.entity} and id = ${change.id}
          limit 1
        `;
        const current = currentRows[0] ? rowToRecord(currentRows[0]) : null;
        const decision = mergeSyncChange(current, change);

        await tx`
          insert into sync_records (
            entity, id, data, created_at, updated_at, deleted_at, version_hlc, device_id, user_id, field_versions_json
          )
          values (
            ${decision.record.entity}, ${decision.record.id}, ${this.sql.json(toJson(decision.record.data))},
            ${decision.record.created_at}, ${decision.record.updated_at}, ${decision.record.deleted_at},
            ${decision.record.version_hlc}, ${decision.record.device_id}, ${decision.record.user_id},
            ${this.sql.json(toJson(decision.record.field_versions_json))}
          )
          on conflict (entity, id) do update set
            data = excluded.data,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at,
            version_hlc = excluded.version_hlc,
            device_id = excluded.device_id,
            user_id = excluded.user_id,
            field_versions_json = excluded.field_versions_json
        `;

        for (const conflict of decision.conflicts) {
          await tx`
            insert into sync_conflicts (
              id, entity, record_id, field_name, local_value, server_value, chosen_value,
              strategy, op_id, status, created_at, resolved_at
            )
            values (
              ${conflict.id}, ${conflict.entity}, ${conflict.record_id}, ${conflict.field_name},
              ${this.sql.json(toJson(conflict.local_value))}, ${this.sql.json(toJson(conflict.server_value))}, ${this.sql.json(toJson(conflict.chosen_value))},
              ${conflict.strategy}, ${conflict.op_id}, ${conflict.status}, ${conflict.created_at}, ${conflict.resolved_at}
            )
            on conflict (id) do nothing
          `;
        }

        const eventRows = await tx`
          insert into sync_events (entity, record_id, device_id, op_id, record, created_at)
          values (
            ${decision.record.entity}, ${decision.record.id}, ${change.device_id}, ${change.op_id},
            ${this.sql.json(toJson(decision.record))}, ${new Date().toISOString()}
          )
          returning seq
        `;

        await tx`
          insert into sync_operations (device_id, op_id, status, reason, created_at)
          values (${change.device_id}, ${change.op_id}, 'accepted', null, ${new Date().toISOString()})
          on conflict (device_id, op_id) do nothing
        `;

        return {
          status: 'accepted' as const,
          conflicts: decision.conflicts,
          record: decision.record,
          cursor: String(eventRows[0]?.seq ?? '0')
        };
      });

      if (result.status === 'accepted') {
        accepted.push(change.op_id);
        conflicts.push(...result.conflicts);
      } else {
        rejected.push({ op_id: change.op_id, reason: 'Change could not be applied.' });
      }
    }

    const cursorRows = await this.sql`select coalesce(max(seq), 0) as cursor from sync_events`;
    return {
      accepted,
      rejected,
      conflicts,
      cursor: String(cursorRows[0]?.cursor ?? '0')
    };
  }

  async pull(_deviceId: string, cursor: string | null | undefined, limit: number): Promise<SyncPullResult> {
    if (!cursor) {
      const records = await this.sql`
        select entity, id, data, created_at, updated_at, deleted_at, version_hlc, device_id, user_id, field_versions_json
        from sync_records
        order by updated_at asc, id asc
        limit ${limit}
      `;
      const cursorRows = await this.sql`select coalesce(max(seq), 0) as cursor from sync_events`;
      return {
        changes: records.map(rowToRecord),
        next_cursor: String(cursorRows[0]?.cursor ?? '0'),
        has_more: records.length === limit
      };
    }

    const events = await this.sql`
      select seq, record from sync_events
      where seq > ${Number(cursor)}
      order by seq asc
      limit ${limit}
    `;
    const lastSeq = events.at(-1)?.seq ?? Number(cursor);
    const hasMore = await this.sql`select 1 from sync_events where seq > ${lastSeq} limit 1`;

    return {
      changes: events.map((row) => row.record as SyncRecordData),
      next_cursor: String(lastSeq),
      has_more: hasMore.length > 0
    };
  }

  async listConflicts(status = 'open'): Promise<SyncConflictData[]> {
    const rows = await this.sql`
      select id, entity, record_id, field_name, local_value, server_value, chosen_value,
             strategy, op_id, status, created_at, resolved_at
      from sync_conflicts
      where status = ${status}
      order by created_at asc
    `;
    return rows.map(rowToConflict);
  }

  async resolveConflict(id: string, resolution: ConflictResolution): Promise<SyncConflictData | null> {
    const rows = await this.sql`
      update sync_conflicts
      set status = ${resolution.status}, chosen_value = ${this.sql.json(toJson(resolution.chosen_fields))}, resolved_at = ${new Date().toISOString()}
      where id = ${id}
      returning id, entity, record_id, field_name, local_value, server_value, chosen_value,
                strategy, op_id, status, created_at, resolved_at
    `;
    return rows[0] ? rowToConflict(rows[0]) : null;
  }
}

function rowToRecord(row: postgres.Row): SyncRecordData {
  return {
    entity: row.entity,
    id: row.id,
    data: row.data ?? {},
    created_at: dateToIso(row.created_at),
    updated_at: dateToIso(row.updated_at),
    deleted_at: row.deleted_at ? dateToIso(row.deleted_at) : null,
    version_hlc: row.version_hlc,
    device_id: row.device_id,
    user_id: row.user_id ?? null,
    field_versions_json: row.field_versions_json ?? {}
  };
}

function rowToConflict(row: postgres.Row): SyncConflictData {
  return {
    id: row.id,
    entity: row.entity,
    record_id: row.record_id,
    field_name: row.field_name,
    local_value: row.local_value,
    server_value: row.server_value,
    chosen_value: row.chosen_value,
    strategy: row.strategy,
    op_id: row.op_id,
    status: row.status,
    created_at: dateToIso(row.created_at),
    resolved_at: row.resolved_at ? dateToIso(row.resolved_at) : null
  };
}

function dateToIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toJson(value: unknown): postgres.JSONValue {
  return value as postgres.JSONValue;
}
