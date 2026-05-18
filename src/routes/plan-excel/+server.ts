import ExcelJS from 'exceljs';
import { json, type RequestHandler } from '@sveltejs/kit';
import {
  addDaysIso,
  dateFromIso,
  dayKeyForIso,
  datesInRange,
  employeeAppointmentCount,
  isoDate,
  monthRangeEnd,
  normaliseClients,
  normaliseEmployees,
  weekDays,
  type Client,
  type Employee,
  type ViewMode
} from '$lib/domain/planner';

interface PlanExcelPayload {
  clients?: Client[];
  employees?: Employee[];
  weekStart?: string;
  viewMode?: ViewMode;
  year?: number;
  month?: number;
}

const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5D1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5D1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5D1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5D1' } }
};

const headerFill = 'FF0F766E';

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseWeekStart(value: string | undefined): string {
  const iso = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
}

function dayLabelForIso(isoDate: string): string {
  const key = dayKeyForIso(isoDate);
  return weekDays.find((day) => day.key === key)?.full ?? 'Montag';
}

function appointmentText(employee: Employee, isoDateValue: string): string {
  const appointments = employee.appointments.filter((appointment) => appointment.date === isoDateValue);
  if (appointments.length === 0) return 'Keine Termine';

  return appointments
    .map((appointment) => {
      const address = appointment.clientAddress ? `\n${appointment.clientAddress}` : '';
      return `${appointment.start} - ${appointment.end}\n${appointment.clientName || 'Klient/in'}${address}`;
    })
    .join('\n\n');
}

function styleRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.border = border;
    cell.alignment = { vertical: 'top', wrapText: true };
  });
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.fill = fill(headerFill);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
}

function createWeekSheet(workbook: ExcelJS.Workbook, employees: Employee[], rangeStart: string): void {
  const rangeEnd = addDaysIso(rangeStart, 6);
  const dates = datesInRange(rangeStart, rangeEnd);
  const sheet = workbook.addWorksheet('Wochenplan', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1 }]
  });

  sheet.columns = [{ width: 28 }, ...dates.map(() => ({ width: 26 })), { width: 12 }];
  sheet.mergeCells(1, 1, 1, dates.length + 2);
  sheet.getCell(1, 1).value = `Wochenplan ${rangeStart} bis ${rangeEnd}`;
  sheet.getCell(1, 1).fill = fill(headerFill);
  sheet.getCell(1, 1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  sheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  const header = sheet.getRow(3);
  header.values = [
    'Mitarbeiter/in',
    ...dates.map((date) => `${weekDays.find((day) => day.key === dayKeyForIso(date))?.label ?? ''} ${dateFromIso(date).toLocaleDateString('de-CH')}`),
    'Termine'
  ];
  styleHeader(header);

  let rowNumber = 4;
  for (const employee of employees) {
    const row = sheet.getRow(rowNumber);
    row.values = [
      `${employee.name}${employee.role ? `\n${employee.role}` : ''}${employee.phone ? `\n${employee.phone}` : ''}`,
      ...dates.map((date) => appointmentText(employee, date)),
      employeeAppointmentCount(employee, rangeStart, rangeEnd)
    ];
    styleRow(row);
    row.height = 58;
    rowNumber += 1;
  }

  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
  };
}

function createMonthSheet(
  workbook: ExcelJS.Workbook,
  employees: Employee[],
  year: number,
  month: number
): void {
  const rangeStart = isoDate(year, month, 1);
  const rangeEnd = monthRangeEnd(year, month);
  const sheet = workbook.addWorksheet('Monatsplan', {
    views: [{ state: 'frozen', ySplit: 3 }]
  });

  sheet.columns = [{ width: 18 }, { width: 28 }, { width: 44 }];
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = `Monatsplan ${String(month).padStart(2, '0')}.${year}`;
  sheet.getCell('A1').fill = fill(headerFill);
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  const header = sheet.getRow(3);
  header.values = ['Datum', 'Mitarbeiter/in', 'Termine'];
  styleHeader(header);

  let rowNumber = 4;
  for (const date of datesInRange(rangeStart, rangeEnd)) {
    for (const employee of employees) {
      const hasAppointments = employee.appointments.some((appointment) => appointment.date === date);
      if (!hasAppointments) continue;

      const row = sheet.getRow(rowNumber);
      row.values = [
        `${dayLabelForIso(date)}\n${dateFromIso(date).toLocaleDateString('de-CH')}`,
        `${employee.name}${employee.role ? `\n${employee.role}` : ''}`,
        appointmentText(employee, date)
      ];
      styleRow(row);
      row.height = 46;
      rowNumber += 1;
    }
  }

  if (rowNumber === 4) {
    const row = sheet.getRow(rowNumber);
    row.values = ['-', '-', 'Keine Termine'];
    styleRow(row);
  }

  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
  };
}

export const POST: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as PlanExcelPayload;
  const weekStart = parseWeekStart(payload.weekStart);
  const viewMode: ViewMode = payload.viewMode === 'month' ? 'month' : 'week';
  const year = Number.isFinite(payload.year) ? Number(payload.year) : dateFromIso(weekStart).getUTCFullYear();
  const month = Number.isFinite(payload.month) ? Number(payload.month) : dateFromIso(weekStart).getUTCMonth() + 1;
  const clients = normaliseClients(payload.clients);
  const employees = normaliseEmployees(payload.employees, weekStart, clients);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Besmir Spitex Einsatzplanung';
  workbook.created = new Date();
  workbook.modified = new Date();

  if (viewMode === 'month') {
    createMonthSheet(workbook, employees, year, month);
  } else {
    createWeekSheet(workbook, employees, weekStart);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename =
    viewMode === 'month'
      ? `monatsplan-${year}-${String(month).padStart(2, '0')}.xlsx`
      : `wochenplan-${weekStart}.xlsx`;

  return new Response(buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
};

export const GET: RequestHandler = () => {
  return json({ ok: true });
};
