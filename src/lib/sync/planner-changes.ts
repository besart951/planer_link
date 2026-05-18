import {
  currentMondayIso,
  normaliseClients,
  normaliseDeletedRecords,
  normaliseEmployees,
  type Client,
  type DeletedSyncRecord,
  type Employee,
  type PlannerSettings,
  type StoredPlanner,
} from "$lib/domain/planner";
import { nextHlc } from "./hlc";
import type { SyncChange } from "./types";

export interface PlannerChangeInput {
  storedPlanner: StoredPlanner;
  deviceId: string;
  userId?: string | null;
  previousHlc?: string | null;
  now?: Date;
}

export function storedPlannerToSyncChanges(
  input: PlannerChangeInput,
): SyncChange[] {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  let clock = input.previousHlc ?? null;
  const fallbackWeekStart =
    input.storedPlanner.weekStart ?? currentMondayIso(now);
  const clients = normaliseClients(input.storedPlanner.clients);
  const deletedRecords = normaliseDeletedRecords(input.storedPlanner.deletedRecords);
  const employees = normaliseEmployees(
    input.storedPlanner.employees,
    fallbackWeekStart,
    clients,
  );
  const changes: SyncChange[] = [];

  for (const record of deletedRecords) {
    clock = nextHlc(clock, input.deviceId, now.getTime());
    changes.push(
      deletedRecordToChange(
        record,
        input.deviceId,
        input.userId ?? null,
        clock,
        nowIso,
      ),
    );
  }

  for (const client of clients) {
    clock = nextHlc(clock, input.deviceId, now.getTime());
    changes.push(
      clientToChange(
        client,
        input.deviceId,
        input.userId ?? null,
        clock,
        nowIso,
      ),
    );
  }

  for (const employee of employees) {
    clock = nextHlc(clock, input.deviceId, now.getTime());
    changes.push(
      employeeToChange(
        employee,
        input.deviceId,
        input.userId ?? null,
        clock,
        nowIso,
      ),
    );

    for (const appointment of employee.appointments) {
      clock = nextHlc(clock, input.deviceId, now.getTime());
      changes.push({
        op_id: `localstorage:${appointment.id}:${clock}`,
        entity: "appointment",
        id: appointment.id,
        operation: "upsert",
        base_version: null,
        version_hlc: clock,
        updated_at: nowIso,
        deleted_at: null,
        device_id: input.deviceId,
        user_id: input.userId ?? null,
        fields: {
          ...appointment,
          employeeId: employee.id,
        },
        field_versions: fieldVersions(
          appointment as unknown as Record<string, unknown>,
          clock,
          ["id"],
        ),
      });
    }
  }

  const settings = plannerSettingsFromStored(
    input.storedPlanner,
    employees,
    fallbackWeekStart,
  );
  clock = nextHlc(clock, input.deviceId, now.getTime());
  changes.push({
    op_id: `localstorage:planner-settings:${clock}`,
    entity: "planner_settings",
    id: "planner-settings",
    operation: "upsert",
    base_version: null,
    version_hlc: clock,
    updated_at: nowIso,
    deleted_at: null,
    device_id: input.deviceId,
    user_id: input.userId ?? null,
    fields: settings as unknown as Record<string, unknown>,
    field_versions: fieldVersions(
      settings as unknown as Record<string, unknown>,
      clock,
    ),
  });

  return changes;
}

function deletedRecordToChange(
  record: DeletedSyncRecord,
  deviceId: string,
  userId: string | null,
  clock: string,
  nowIso: string,
): SyncChange {
  return {
    op_id: `localstorage:delete:${record.entity}:${record.id}:${record.deletedAt}`,
    entity: record.entity,
    id: record.id,
    operation: "delete",
    base_version: null,
    version_hlc: clock,
    updated_at: nowIso,
    deleted_at: record.deletedAt,
    device_id: deviceId,
    user_id: userId,
    fields: {},
    field_versions: {},
  };
}

function clientToChange(
  client: Client,
  deviceId: string,
  userId: string | null,
  clock: string,
  nowIso: string,
): SyncChange {
  return {
    op_id: `localstorage:${client.id}:${clock}`,
    entity: "client",
    id: client.id,
    operation: "upsert",
    base_version: null,
    version_hlc: clock,
    updated_at: nowIso,
    deleted_at: null,
    device_id: deviceId,
    user_id: userId,
    fields: client as unknown as Record<string, unknown>,
    field_versions: fieldVersions(
      client as unknown as Record<string, unknown>,
      clock,
      ["id"],
    ),
  };
}

function employeeToChange(
  employee: Employee,
  deviceId: string,
  userId: string | null,
  clock: string,
  nowIso: string,
): SyncChange {
  const { appointments: _appointments, ...employeeFields } = employee;

  return {
    op_id: `localstorage:${employee.id}:${clock}`,
    entity: "employee",
    id: employee.id,
    operation: "upsert",
    base_version: null,
    version_hlc: clock,
    updated_at: nowIso,
    deleted_at: null,
    device_id: deviceId,
    user_id: userId,
    fields: employeeFields,
    field_versions: fieldVersions(
      employeeFields as unknown as Record<string, unknown>,
      clock,
      ["id"],
    ),
  };
}

function plannerSettingsFromStored(
  storedPlanner: StoredPlanner,
  employees: Employee[],
  fallbackWeekStart: string,
): PlannerSettings {
  return {
    selectedEmployeeId:
      storedPlanner.selectedEmployeeId ?? employees[0]?.id ?? "",
    weekStart: storedPlanner.weekStart ?? fallbackWeekStart,
    viewMode: storedPlanner.viewMode === "month" ? "month" : "week",
    printOrientation:
      storedPlanner.printOrientation === "portrait" ? "portrait" : "landscape",
    year: Number.isFinite(storedPlanner.year)
      ? Number(storedPlanner.year)
      : new Date().getFullYear(),
    month: Number.isFinite(storedPlanner.month)
      ? Number(storedPlanner.month)
      : new Date().getMonth() + 1,
    staffSlots: Number.isFinite(storedPlanner.staffSlots)
      ? Number(storedPlanner.staffSlots)
      : 12,
    tourRows: Number.isFinite(storedPlanner.tourRows)
      ? Number(storedPlanner.tourRows)
      : 400,
  };
}

function fieldVersions(
  fields: Record<string, unknown>,
  clock: string,
  ignoredFields: string[] = [],
): Record<string, string> {
  const ignored = new Set(ignoredFields);
  return Object.fromEntries(
    Object.keys(fields)
      .filter((field) => !ignored.has(field))
      .map((field) => [field, clock]),
  );
}
