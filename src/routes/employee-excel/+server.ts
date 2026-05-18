import ExcelJS from 'exceljs';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
  addDaysIso,
  dateFromIso,
  dayKeyForIso,
  datesInRange,
  isoDate,
  normaliseClients,
  normaliseEmployees,
  safeFilePart,
  weekDays,
  type Client,
  type Employee,
  type ViewMode
} from '$lib/domain/planner';

interface EmployeeExcelPayload {
  clients?: Client[];
  employee?: Employee;
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

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function excelFilePart(value: string): string {
  return safeFilePart(value) || 'mitarbeiter';
}

function parseWeekStart(value: string | undefined): Date {
  const iso = text(value);
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (!Number.isFinite(date.getTime())) {
    return new Date();
  }

  return date;
}

function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabelForIso(isoDate: string): string {
  const key = dayKeyForIso(isoDate);
  return weekDays.find((day) => day.key === key)?.full ?? 'Montag';
}

function normaliseEmployee(value: unknown, fallbackWeekStart: string, clients: Client[]): Employee {
  if (!value || typeof value !== 'object') {
    throw error(400, 'Mitarbeiter fehlt.');
  }

  const employee = normaliseEmployees([value], fallbackWeekStart, clients)[0];
  if (!text(employee.name)) {
    throw error(400, 'Mitarbeitername fehlt.');
  }

  return employee;
}

function appointmentsForDate(employee: Employee, isoDateValue: string) {
  return employee.appointments.filter((appointment) => appointment.date === isoDateValue);
}

function styleRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function createWorkbook(
  employee: Employee,
  rangeStart: string,
  rangeEnd: string,
  viewMode: ViewMode
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Besmir Spitex Einsatzplanung';
  workbook.created = new Date();
  workbook.modified = new Date();
  const planLabel = viewMode === 'month' ? 'Monatsplan' : 'Wochenplan';

  const sheet = workbook.addWorksheet(planLabel, {
    views: [{ state: 'frozen', ySplit: 6 }]
  });

  sheet.columns = [{ width: 16 }, { width: 13 }, { width: 11 }, { width: 11 }, { width: 34 }];

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = `${planLabel} ${employee.name}`;
  sheet.getCell('A1').fill = fill('FF164E45');
  sheet.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 26;

  sheet.getCell('A3').value = 'Mitarbeiter/in';
  sheet.getCell('B3').value = employee.name;
  sheet.getCell('A4').value = 'Rolle';
  sheet.getCell('B4').value = employee.role || 'Keine Rolle';
  sheet.getCell('D3').value = 'Telefon';
  sheet.getCell('E3').value = employee.phone || '';
  sheet.getCell('D4').value = 'Zeitraum';
  sheet.getCell('E4').value = `${rangeStart} bis ${rangeEnd}`;

  for (const address of ['A3', 'A4', 'D3', 'D4']) {
    sheet.getCell(address).font = { bold: true };
    sheet.getCell(address).fill = fill('FFE8F3EF');
  }

  const header = sheet.getRow(6);
  header.values = ['Wochentag', 'Datum', 'Start', 'Ende', 'Klient/in'];
  header.eachCell((cell) => {
    cell.fill = fill('FF164E45');
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });

  let rowNumber = 7;
  for (const isoDateValue of datesInRange(rangeStart, rangeEnd)) {
    const appointments = appointmentsForDate(employee, isoDateValue);
    const dayDate = dateFromIso(isoDateValue);
    const dayLabel = dayLabelForIso(isoDateValue);

    if (appointments.length === 0) {
      continue;
    }

    for (const appointment of appointments) {
      const row = sheet.getRow(rowNumber);
      row.values = [
        dayLabel,
        dayDate,
        appointment.start,
        appointment.end,
        `${appointment.clientName || 'Klient/in'}${appointment.clientAddress ? `\n${appointment.clientAddress}` : ''}`
      ];
      row.getCell(2).numFmt = 'dd.mm.yyyy';
      row.getCell(5).fill = fill('FFDDF3E4');
      styleRow(row);
      rowNumber += 1;
    }
  }

  const totalAppointments = datesInRange(rangeStart, rangeEnd).reduce(
    (sum, isoDateValue) => sum + appointmentsForDate(employee, isoDateValue).length,
    0
  );
  const summaryRow = sheet.getRow(rowNumber + 1);
  summaryRow.values = ['Summe', '', '', '', `${totalAppointments} Termine`];
  summaryRow.eachCell((cell) => {
    cell.fill = fill('FFE8F3EF');
    cell.font = { bold: true };
    cell.border = border;
  });

  sheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: 5 }
  };
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }
  };

  return workbook;
}

export const POST: RequestHandler = async ({ request }) => {
  const payload = (await request.json()) as EmployeeExcelPayload;
  const weekStart = parseWeekStart(payload.weekStart);
  const viewMode: ViewMode = payload.viewMode === 'month' ? 'month' : 'week';
  const year = Number.isFinite(payload.year) ? Number(payload.year) : weekStart.getUTCFullYear();
  const month = Number.isFinite(payload.month) ? Number(payload.month) : weekStart.getUTCMonth() + 1;
  const rangeStart = viewMode === 'month' ? isoDate(year, month, 1) : isoFromDate(weekStart);
  const rangeEnd =
    viewMode === 'month'
      ? isoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate())
      : addDaysIso(rangeStart, 6);
  const clients = normaliseClients(payload.clients);
  const employee = normaliseEmployee(payload.employee, rangeStart, clients);
  const workbook = createWorkbook(employee, rangeStart, rangeEnd, viewMode);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename =
    viewMode === 'month'
      ? `monatsplan-${excelFilePart(employee.name)}-${year}-${String(month).padStart(2, '0')}.xlsx`
      : `wochenplan-${excelFilePart(employee.name)}-${rangeStart}.xlsx`;

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
