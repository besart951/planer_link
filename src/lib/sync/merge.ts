import { compareHlc } from './hlc';
import type { SyncChange, SyncConflictData, SyncRecordData } from './types';

const defaultServerWinsFields = new Set(['user_id', 'tenant_id', 'created_by', 'server_seq']);

export interface MergeDecision {
  record: SyncRecordData;
  conflicts: SyncConflictData[];
  ignored: boolean;
}

export function mergeSyncChange(
  serverRecord: SyncRecordData | null,
  change: SyncChange,
  nowIso = new Date().toISOString()
): MergeDecision {
  const incomingDeletedAt = change.operation === 'delete' ? (change.deleted_at ?? nowIso) : (change.deleted_at ?? null);

  if (!serverRecord) {
    return {
      record: {
        entity: change.entity,
        id: change.id,
        data: { ...change.fields },
        created_at: nowIso,
        updated_at: change.updated_at,
        deleted_at: incomingDeletedAt,
        version_hlc: change.version_hlc,
        device_id: change.device_id,
        user_id: change.user_id ?? null,
        field_versions_json: { ...change.field_versions }
      },
      conflicts: [],
      ignored: false
    };
  }

  if (serverRecord.deleted_at && change.operation !== 'restore') {
    return {
      record: serverRecord,
      conflicts: [
        makeConflict({
          change,
          fieldName: '_row',
          localValue: change.fields,
          serverValue: serverRecord.data,
          chosenValue: serverRecord.data,
          strategy: 'tombstone_wins',
          nowIso
        })
      ],
      ignored: true
    };
  }

  if (change.operation === 'delete') {
    if (serverRecord.deleted_at && compareHlc(serverRecord.version_hlc, change.version_hlc) >= 0) {
      return { record: serverRecord, conflicts: [], ignored: true };
    }

    return {
      record: {
        ...serverRecord,
        updated_at: change.updated_at,
        deleted_at: incomingDeletedAt,
        version_hlc: change.version_hlc,
        device_id: change.device_id,
        user_id: serverRecord.user_id,
        field_versions_json: {
          ...serverRecord.field_versions_json,
          _deleted_at: change.version_hlc
        }
      },
      conflicts: [],
      ignored: false
    };
  }

  const data = { ...serverRecord.data };
  const fieldVersions = { ...serverRecord.field_versions_json };
  const conflicts: SyncConflictData[] = [];

  for (const [fieldName, incomingValue] of Object.entries(change.fields)) {
    if (defaultServerWinsFields.has(fieldName)) continue;

    const serverVersion = fieldVersions[fieldName] ?? serverRecord.version_hlc;
    const incomingVersion = change.field_versions[fieldName] ?? change.version_hlc;
    const comparison = compareHlc(incomingVersion, serverVersion);

    if (comparison > 0) {
      data[fieldName] = incomingValue;
      fieldVersions[fieldName] = incomingVersion;
      continue;
    }

    if (comparison === 0 && JSON.stringify(data[fieldName]) !== JSON.stringify(incomingValue)) {
      const chooseIncoming = change.device_id > serverRecord.device_id;
      const chosenValue = chooseIncoming ? incomingValue : data[fieldName];

      if (chooseIncoming) {
        data[fieldName] = incomingValue;
        fieldVersions[fieldName] = incomingVersion;
      }

      conflicts.push(
        makeConflict({
          change,
          fieldName,
          localValue: incomingValue,
          serverValue: serverRecord.data[fieldName],
          chosenValue,
          strategy: 'lww_tie_break_device_id',
          nowIso
        })
      );
    }
  }

  return {
    record: {
      ...serverRecord,
      data,
      updated_at: maxIso(serverRecord.updated_at, change.updated_at),
      deleted_at: change.operation === 'restore' ? null : serverRecord.deleted_at,
      version_hlc: compareHlc(change.version_hlc, serverRecord.version_hlc) > 0 ? change.version_hlc : serverRecord.version_hlc,
      device_id: change.device_id,
      field_versions_json: fieldVersions
    },
    conflicts,
    ignored: false
  };
}

function maxIso(left: string, right: string): string {
  return left > right ? left : right;
}

function makeConflict(input: {
  change: SyncChange;
  fieldName: string;
  localValue: unknown;
  serverValue: unknown;
  chosenValue: unknown;
  strategy: string;
  nowIso: string;
}): SyncConflictData {
  return {
    id: `${input.change.op_id}:${input.fieldName}`,
    entity: input.change.entity,
    record_id: input.change.id,
    field_name: input.fieldName,
    local_value: input.localValue,
    server_value: input.serverValue,
    chosen_value: input.chosenValue,
    strategy: input.strategy,
    op_id: input.change.op_id,
    status: 'open',
    created_at: input.nowIso,
    resolved_at: null
  };
}
