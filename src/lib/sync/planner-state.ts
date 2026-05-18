import {
  currentMondayIso,
  normaliseAppointment,
  normaliseClient,
  normaliseClients,
  normaliseEmployees,
  type Client,
  type Employee,
  type PlannerSettings,
  type StoredPlanner,
} from "$lib/domain/planner";
import type { SyncRecordData } from "./types";

type AppointmentData = Record<string, unknown> & {
  employeeId?: unknown;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

export function applySyncRecordsToStoredPlanner(
  records: SyncRecordData[],
  current: StoredPlanner,
): StoredPlanner {
  const fallbackWeekStart = current.weekStart ?? currentMondayIso();
  const clientMap = new Map(
    normaliseClients(current.clients).map((client) => [client.id, client]),
  );
  const initialClients = Array.from(clientMap.values());
  const employeeMap = new Map(
    normaliseEmployees(current.employees, fallbackWeekStart, initialClients).map((employee) => [
      employee.id,
      { ...employee, appointments: [...employee.appointments] },
    ]),
  );
  let settings: Partial<PlannerSettings> = {};

  for (const record of records) {
    if (record.entity !== "client") continue;

    if (record.deleted_at) {
      clientMap.delete(record.id);
      continue;
    }

    const client = normaliseClient({ ...record.data, id: record.id });
    if (client) clientMap.set(record.id, client);
  }

  for (const record of records) {
    if (record.entity !== "employee") continue;

    if (record.deleted_at) {
      employeeMap.delete(record.id);
      continue;
    }

    const existing = employeeMap.get(record.id);
    const employee = normaliseEmployees(
      [
        {
          ...existing,
          ...record.data,
          id: record.id,
          appointments: existing?.appointments ?? [],
        },
      ],
      fallbackWeekStart,
      Array.from(clientMap.values()),
    )[0];
    employeeMap.set(record.id, employee);
  }

  for (const record of records) {
    if (record.entity !== "appointment") continue;

    for (const employee of employeeMap.values()) {
      employee.appointments = employee.appointments.filter(
        (appointment) => appointment.id !== record.id,
      );
    }

    if (record.deleted_at) continue;

    const data = record.data as AppointmentData;
    const employeeId = text(data.employeeId);
    const appointment = normaliseAppointment(
      { ...data, id: record.id },
      fallbackWeekStart,
      Array.from(clientMap.values()),
    );
    const employee = employeeId ? employeeMap.get(employeeId) : undefined;

    if (employee && appointment) {
      employee.appointments = [...employee.appointments, appointment];
    }
  }

  for (const record of records) {
    if (record.entity === "planner_settings" && !record.deleted_at) {
      settings = record.data as Partial<PlannerSettings>;
    }
  }

  const clients: Client[] = normaliseClients(Array.from(clientMap.values()));
  const employees: Employee[] = normaliseEmployees(
    Array.from(employeeMap.values()),
    text(settings.weekStart) ?? fallbackWeekStart,
    clients,
  );
  const selectedEmployeeId =
    text(settings.selectedEmployeeId) ?? current.selectedEmployeeId;

  return {
    clients,
    employees,
    selectedEmployeeId: employees.some(
      (employee) => employee.id === selectedEmployeeId,
    )
      ? selectedEmployeeId
      : (employees[0]?.id ?? ""),
    weekStart: text(settings.weekStart) ?? current.weekStart,
    viewMode:
      settings.viewMode === "month" ? "month" : (current.viewMode ?? "week"),
    printOrientation:
      settings.printOrientation === "portrait"
        ? "portrait"
        : (current.printOrientation ?? "landscape"),
    year: numberValue(settings.year) ?? current.year,
    month: numberValue(settings.month) ?? current.month,
    staffSlots: numberValue(settings.staffSlots) ?? current.staffSlots,
    tourRows: numberValue(settings.tourRows) ?? current.tourRows,
  };
}
