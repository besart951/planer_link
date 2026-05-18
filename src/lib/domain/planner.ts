export const plannerStorageKey = 'besmir-spitex-planner-v2';

export const months = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
] as const;

export const weekDays = [
  { key: 'mo', label: 'Mo', full: 'Montag' },
  { key: 'di', label: 'Di', full: 'Dienstag' },
  { key: 'mi', label: 'Mi', full: 'Mittwoch' },
  { key: 'do', label: 'Do', full: 'Donnerstag' },
  { key: 'fr', label: 'Fr', full: 'Freitag' },
  { key: 'sa', label: 'Sa', full: 'Samstag' },
  { key: 'so', label: 'So', full: 'Sonntag' }
] as const;

export type DayKey = (typeof weekDays)[number]['key'];
export type PrintScope = 'all' | 'employee';
export type ViewMode = 'week' | 'month';
export type PrintOrientation = 'landscape' | 'portrait';
export type DeletedSyncEntity = 'client' | 'employee' | 'appointment';

export interface Client {
  id: string;
  name: string;
  address: string;
  defaultStart: string;
  defaultEnd: string;
}

export interface Appointment {
  id: string;
  day: DayKey;
  date: string;
  clientName: string;
  clientAddress: string;
  start: string;
  end: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string;
  appointments: Appointment[];
}

export interface PlannerSettings {
  selectedEmployeeId: string;
  weekStart: string;
  viewMode: ViewMode;
  printOrientation: PrintOrientation;
  year: number;
  month: number;
  staffSlots: number;
  tourRows: number;
}

export interface DeletedSyncRecord {
  entity: DeletedSyncEntity;
  id: string;
  deletedAt: string;
}

export interface StoredPlanner {
  clients?: Client[];
  employees?: Employee[];
  deletedRecords?: DeletedSyncRecord[];
  selectedEmployeeId?: string;
  weekStart?: string;
  viewMode?: ViewMode;
  printOrientation?: PrintOrientation;
  year?: number;
  month?: number;
  staffSlots?: number;
  tourRows?: number;
}

export type AppointmentField = keyof Omit<Appointment, 'id'>;
export type ClientField = keyof Omit<Client, 'id'>;

export interface DateItem {
  iso: string;
  key: DayKey;
  label: string;
  full: string;
  dateLabel: string;
  dayNumber: number;
  isWeekend: boolean;
}

export const defaultClients: Client[] = [
  {
    id: 'client-maria',
    name: 'Maria Huber',
    address: '',
    defaultStart: '08:00',
    defaultEnd: '08:45'
  },
  {
    id: 'client-peter',
    name: 'Peter Meier',
    address: '',
    defaultStart: '09:30',
    defaultEnd: '10:15'
  }
];

export const defaultEmployees: Employee[] = [
  {
    id: 'emp-anna',
    name: 'Anna Keller',
    role: 'Pflegefachperson HF',
    phone: '+41 79 111 22 33',
    appointments: [
      {
        id: 'apt-anna-mo-1',
        day: 'mo',
        date: '2026-05-11',
        clientName: 'Maria Huber',
        clientAddress: '',
        start: '08:00',
        end: '08:45'
      }
    ]
  },
  {
    id: 'emp-besart',
    name: 'Besart Morina',
    role: 'Einsatzleitung',
    phone: '+41 79 222 33 44',
    appointments: [
      {
        id: 'apt-besart-sa-1',
        day: 'sa',
        date: '2026-05-16',
        clientName: 'Peter Meier',
        clientAddress: '',
        start: '09:30',
        end: '10:15'
      }
    ]
  }
];

export function cloneDefaultClients(): Client[] {
  return defaultClients.map((client) => ({ ...client }));
}

export function cloneDefaultEmployees(): Employee[] {
  return defaultEmployees.map((employee) => cloneEmployee(employee));
}

export function cloneEmployee(employee: Employee): Employee {
  return {
    ...employee,
    appointments: employee.appointments.map((appointment) => ({ ...appointment }))
  };
}

export function makeId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export function currentMondayIso(now = new Date()): string {
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  return monday.toISOString().slice(0, 10);
}

export function isoDate(yearValue: number, monthValue: number, dayValue: number): string {
  return `${yearValue}-${String(monthValue).padStart(2, '0')}-${String(dayValue).padStart(2, '0')}`;
}

export function dateFromIso(isoDate: string): Date {
  const [yearPart, monthPart, dayPart] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(yearPart, monthPart - 1, dayPart));
}

export function addDaysIso(isoDate: string, offset: number): string {
  const date = dateFromIso(isoDate);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dayKeyForIso(isoDate: string): DayKey {
  const index = (dateFromIso(isoDate).getUTCDay() + 6) % 7;
  return weekDays[index].key;
}

export function isDayKey(value: unknown): value is DayKey {
  return weekDays.some((day) => day.key === value);
}

export function dateItem(isoDate: string): DateItem {
  const key = dayKeyForIso(isoDate);
  const day = weekDays.find((entry) => entry.key === key) ?? weekDays[0];
  const date = dateFromIso(isoDate);

  return {
    iso: isoDate,
    key,
    label: day.label,
    full: day.full,
    dateLabel: new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit' }).format(date),
    dayNumber: date.getUTCDate(),
    isWeekend: key === 'sa' || key === 'so'
  };
}

export function formatWeekDate(isoDate: string, offset: number): string {
  if (!isoDate) return '';
  return dateItem(addDaysIso(isoDate, offset)).dateLabel;
}

export function dateIsoForWeekDay(weekStartIso: string, day: DayKey): string {
  const dayIndex = weekDays.findIndex((entry) => entry.key === day);
  return addDaysIso(weekStartIso, Math.max(0, dayIndex));
}

export function weekDateItems(weekStartIso: string): DateItem[] {
  return weekDays.map((day) => dateItem(dateIsoForWeekDay(weekStartIso, day.key)));
}

export function monthDateItems(yearValue: number, monthValue: number): DateItem[] {
  const dayCount = new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate();
  return Array.from({ length: dayCount }, (_, index) => dateItem(isoDate(yearValue, monthValue, index + 1)));
}

export function monthRangeEnd(yearValue: number, monthValue: number): string {
  return isoDate(yearValue, monthValue, new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate());
}

export function validIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function normaliseClient(value: unknown): Client | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<Client>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!name) return null;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : makeId('client'),
    name,
    address: typeof candidate.address === 'string' ? candidate.address : '',
    defaultStart: typeof candidate.defaultStart === 'string' ? candidate.defaultStart : '',
    defaultEnd: typeof candidate.defaultEnd === 'string' ? candidate.defaultEnd : ''
  };
}

export function normaliseClients(value: unknown): Client[] {
  if (!Array.isArray(value)) return cloneDefaultClients();

  const normalised = value
    .map((client) => normaliseClient(client))
    .filter((client): client is Client => Boolean(client));

  return normalised;
}

export function normaliseDeletedRecords(value: unknown): DeletedSyncRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((record): record is Partial<DeletedSyncRecord> => Boolean(record && typeof record === 'object'))
    .map((record) => ({
      entity: record.entity === 'client' || record.entity === 'employee' || record.entity === 'appointment' ? record.entity : null,
      id: typeof record.id === 'string' ? record.id : '',
      deletedAt: typeof record.deletedAt === 'string' ? record.deletedAt : ''
    }))
    .filter((record): record is DeletedSyncRecord => Boolean(record.entity && record.id && record.deletedAt));
}

export function normaliseAppointment(
  value: unknown,
  fallbackWeekStart: string,
  clients: Client[] = []
): Appointment | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<Appointment> & { clientId?: unknown };
  const day = isDayKey(candidate.day) ? candidate.day : 'mo';
  const date = validIsoDate(candidate.date) ? candidate.date : dateIsoForWeekDay(fallbackWeekStart, day);
  const linkedClient =
    typeof candidate.clientId === 'string' ? clients.find((client) => client.id === candidate.clientId) : undefined;
  const clientName =
    typeof candidate.clientName === 'string' && candidate.clientName.trim()
      ? candidate.clientName.trim()
      : linkedClient?.name ?? '';
  if (!clientName) return null;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : makeId('apt'),
    day: dayKeyForIso(date),
    date,
    clientName,
    clientAddress:
      typeof candidate.clientAddress === 'string'
        ? candidate.clientAddress
        : linkedClient?.address ?? '',
    start: typeof candidate.start === 'string' ? candidate.start : '',
    end: typeof candidate.end === 'string' ? candidate.end : ''
  };
}

export function normaliseEmployees(value: unknown, fallbackWeekStart: string, clients: Client[] = []): Employee[] {
  if (!Array.isArray(value)) return cloneDefaultEmployees();

  const normalised = value
    .filter((employee): employee is Partial<Employee> => Boolean(employee && typeof employee === 'object'))
    .map((employee) => ({
      id: typeof employee.id === 'string' ? employee.id : makeId('emp'),
      name: typeof employee.name === 'string' && employee.name.trim() ? employee.name : 'Mitarbeiter/in',
      role: typeof employee.role === 'string' ? employee.role : '',
      phone: typeof employee.phone === 'string' ? employee.phone : '',
      appointments: Array.isArray(employee.appointments)
        ? employee.appointments
            .map((appointment) => normaliseAppointment(appointment, fallbackWeekStart, clients))
            .filter((appointment): appointment is Appointment => Boolean(appointment))
        : []
    }));

  return normalised;
}

export function isAppointmentOnDate(appointment: Appointment, isoDateValue: string): boolean {
  return appointment.date === isoDateValue;
}

export function isEnteredAppointment(appointment: Appointment): boolean {
  return Boolean(appointment.clientName);
}

export function dateAppointments(employee: Employee, isoDateValue: string): Appointment[] {
  return employee.appointments.filter((appointment) => isAppointmentOnDate(appointment, isoDateValue));
}

export function enteredAppointments(employee: Employee): Appointment[] {
  return employee.appointments.filter(isEnteredAppointment);
}

export function enteredDateAppointments(employee: Employee, isoDateValue: string): Appointment[] {
  return employee.appointments.filter(
    (appointment) => isEnteredAppointment(appointment) && isAppointmentOnDate(appointment, isoDateValue)
  );
}

export function datesInRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  for (let current = startIso; current <= endIso; current = addDaysIso(current, 1)) {
    dates.push(current);
  }
  return dates;
}

export function employeeAppointmentCount(employee: Employee, startIso: string, endIso: string): number {
  return datesInRange(startIso, endIso).reduce(
    (sum, isoDateValue) => sum + enteredDateAppointments(employee, isoDateValue).length,
    0
  );
}

export function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
