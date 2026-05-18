import ExcelJS from 'exceljs';

export interface SpitexTemplateOptions {
  year: number;
  month: number;
  staffSlots: number;
  tourRows: number;
}

export const MONTH_NAMES = [
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
];

const STATUSES = ['Geplant', 'Erledigt', 'Verschoben', 'Abgesagt'];
const ACTIVE_STATES = ['Aktiv', 'Inaktiv'];
const ROLES = ['Pflegefachperson HF', 'FaGe', 'Pflegehelfer/in SRK', 'Einsatzleitung', 'Administration'];
const MAX_EMPLOYEE_ROWS = 100;
const MAX_CLIENT_ROWS = 200;

const COLORS = {
  header: 'FF164E45',
  headerLight: 'FFE8F3EF',
  primaryText: 'FFFFFFFF',
  subHeader: 'FFDCEBE5',
  border: 'FFCBD5D1',
  weekend: 'FFFFE6C7',
  work: 'FFDDF3E4',
  free: 'FFECEFF1',
  warning: 'FFFFD8D3',
  warningText: 'FF9F1D17',
  statusPlanned: 'FFE6EEF8',
  statusDone: 'FFDDF3E4',
  statusMoved: 'FFFFE6C7',
  statusCanceled: 'FFFFD8D3'
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } }
};

let conditionalFormattingPriority = 1;

function fill(argb: string): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb }
  };
}

function expressionRule(
  formulae: string[],
  style: Partial<ExcelJS.Style>
): ExcelJS.ConditionalFormattingRule {
  const priority = conditionalFormattingPriority;
  conditionalFormattingPriority += 1;

  return {
    type: 'expression',
    priority,
    formulae,
    style
  };
}

function columnLetter(columnNumber: number): string {
  let dividend = columnNumber;
  let columnName = '';

  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - modulo) / 26);
  }

  return columnName;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function dateResult(year: number, month: number, day: number): Date | undefined {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCMonth() === month - 1 ? candidate : undefined;
}

function styleHeaderRow(row: ExcelJS.Row, fillColor = COLORS.header): void {
  row.eachCell((cell) => {
    cell.fill = fill(fillColor);
    cell.font = { bold: true, color: { argb: COLORS.primaryText } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
}

function styleUsedRange(sheet: ExcelJS.Worksheet, lastRow: number, lastColumn: number): void {
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = rowNumber === 1 ? 24 : 21;

    for (let columnNumber = 1; columnNumber <= lastColumn; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.border = thinBorder;
      cell.alignment = {
        vertical: 'middle',
        wrapText: true
      };
    }
  }
}

function setupSheetPrint(sheet: ExcelJS.Worksheet, orientation: 'portrait' | 'landscape'): void {
  sheet.pageSetup = {
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2
    }
  };
}

function addWorkbookNames(workbook: ExcelJS.Workbook): void {
  workbook.definedNames.add('ActiveEmployees', '_Listen!$A$2:$A$101');
  workbook.definedNames.add('ActiveClients', '_Listen!$C$2:$C$201');
  workbook.definedNames.add('StatusList', '_Listen!$D$2:$D$5');
  workbook.definedNames.add('MonthList', '_Listen!$E$2:$E$13');
  workbook.definedNames.add('ActiveStateList', '_Listen!$G$2:$G$3');
  workbook.definedNames.add('RoleList', '_Listen!$H$2:$H$6');
}

function createHelperSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('_Listen');
  sheet.state = 'hidden';

  sheet.getRow(1).values = [
    'Aktive Mitarbeitende',
    'Kürzel',
    'Aktive Klienten',
    'Status',
    'Monat',
    'Monatsnummer',
    'Aktivstatus',
    'Rolle'
  ];
  styleHeaderRow(sheet.getRow(1), COLORS.header);

  for (let row = 2; row <= MAX_EMPLOYEE_ROWS + 1; row += 1) {
    const employeeIndex = row - 1;
    sheet.getCell(row, 1).value = {
      formula: `IFERROR(INDEX(FILTER(Mitarbeitende!$B$2:$B$101,Mitarbeitende!$G$2:$G$101="Aktiv"),${employeeIndex}),"")`
    };
    sheet.getCell(row, 2).value = {
      formula: `IFERROR(INDEX(FILTER(Mitarbeitende!$C$2:$C$101,Mitarbeitende!$G$2:$G$101="Aktiv"),${employeeIndex}),"")`
    };
  }

  for (let row = 2; row <= MAX_CLIENT_ROWS + 1; row += 1) {
    const clientIndex = row - 1;
    sheet.getCell(row, 3).value = {
      formula: `IFERROR(INDEX(FILTER(Klienten!$B$2:$B$201,Klienten!$F$2:$F$201="Aktiv"),${clientIndex}),"")`
    };
  }

  STATUSES.forEach((status, index) => {
    sheet.getCell(index + 2, 4).value = status;
  });

  MONTH_NAMES.forEach((month, index) => {
    sheet.getCell(index + 2, 5).value = month;
    sheet.getCell(index + 2, 6).value = index + 1;
  });

  ACTIVE_STATES.forEach((state, index) => {
    sheet.getCell(index + 2, 7).value = state;
  });

  ROLES.forEach((role, index) => {
    sheet.getCell(index + 2, 8).value = role;
  });

  sheet.columns = [
    { width: 28 },
    { width: 12 },
    { width: 28 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 24 }
  ];

  return sheet;
}

function createSettingsSheet(
  workbook: ExcelJS.Workbook,
  options: SpitexTemplateOptions
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Einstellungen', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  sheet.columns = [{ width: 30 }, { width: 22 }, { width: 28 }];
  sheet.mergeCells('A1:C1');
  sheet.getCell('A1').value = 'Planungsmonat';
  sheet.getCell('A1').fill = fill(COLORS.header);
  sheet.getCell('A1').font = { bold: true, color: { argb: COLORS.primaryText }, size: 14 };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

  const rows: Array<[string, string | number | ExcelJS.CellValue]> = [
    ['Jahr', options.year],
    ['Monat', MONTH_NAMES[options.month - 1]],
    [
      'Startdatum automatisch berechnet',
      {
        formula: 'DATE(B3,VLOOKUP(B4,MonthList,2,FALSE),1)',
        result: new Date(Date.UTC(options.year, options.month - 1, 1))
      }
    ],
    ['Anzahl Tage im Monat automatisch berechnet', { formula: 'DAY(EOMONTH(B5,0))' }]
  ];

  rows.forEach(([label, value], index) => {
    const rowNumber = index + 3;
    sheet.getCell(rowNumber, 1).value = label;
    sheet.getCell(rowNumber, 1).font = { bold: true };
    sheet.getCell(rowNumber, 2).value = value;
  });

  sheet.getCell('B3').dataValidation = {
    type: 'whole',
    operator: 'between',
    allowBlank: false,
    formulae: [2024, 2035],
    showErrorMessage: true,
    errorTitle: 'Ungültiges Jahr',
    error: 'Bitte ein Jahr zwischen 2024 und 2035 eintragen.'
  };
  sheet.getCell('B4').dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['MonthList']
  };

  sheet.getCell('B5').numFmt = 'dd.mm.yyyy';
  sheet.getCell('B6').numFmt = '0';

  styleUsedRange(sheet, 6, 3);
  setupSheetPrint(sheet, 'portrait');

  return sheet;
}

function createEmployeesSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Mitarbeitende', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = [
    'Mitarbeiter-ID',
    'Name',
    'Kürzel',
    'Telefonnummer',
    'Pensum in %',
    'Rolle',
    'Aktiv/Inaktiv',
    'Bemerkung'
  ];
  sheet.getRow(1).values = headers;
  sheet.columns = [
    { width: 16 },
    { width: 24 },
    { width: 12 },
    { width: 18 },
    { width: 13 },
    { width: 24 },
    { width: 14 },
    { width: 34 }
  ];

  const sampleEmployees = [
    ['MA-001', 'Anna Keller', 'AK', '+41 79 111 22 33', 80, 'Pflegefachperson HF', 'Aktiv', ''],
    ['MA-002', 'Besart Morina', 'BM', '+41 79 222 33 44', 100, 'Einsatzleitung', 'Aktiv', ''],
    ['MA-003', 'Laura Schneider', 'LS', '+41 79 333 44 55', 60, 'FaGe', 'Aktiv', ''],
    ['MA-004', 'Mehmet Yilmaz', 'MY', '+41 79 444 55 66', 70, 'Pflegehelfer/in SRK', 'Aktiv', '']
  ];
  sampleEmployees.forEach((employee, index) => {
    sheet.getRow(index + 2).values = employee;
  });

  for (let row = 2; row <= MAX_EMPLOYEE_ROWS + 1; row += 1) {
    sheet.getCell(row, 5).numFmt = '0%';
    sheet.getCell(row, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['RoleList']
    };
    sheet.getCell(row, 7).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['ActiveStateList']
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
  styleHeaderRow(sheet.getRow(1));
  styleUsedRange(sheet, MAX_EMPLOYEE_ROWS + 1, headers.length);
  sheet.addConditionalFormatting({
    ref: `A2:H${MAX_EMPLOYEE_ROWS + 1}`,
    rules: [
      expressionRule(
        ['$G2="Inaktiv"'],
        {
          fill: fill(COLORS.free),
          font: { color: { argb: 'FF6B7280' } }
        }
      )
    ]
  });
  setupSheetPrint(sheet, 'landscape');

  return sheet;
}

function createClientsSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Klienten', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = [
    'Klienten-ID',
    'Name',
    'Adresse',
    'Telefonnummer',
    'Besonderheiten / Hinweise',
    'Aktiv/Inaktiv',
    'Bemerkung'
  ];
  sheet.getRow(1).values = headers;
  sheet.columns = [
    { width: 16 },
    { width: 26 },
    { width: 34 },
    { width: 18 },
    { width: 36 },
    { width: 14 },
    { width: 30 }
  ];

  const sampleClients = [
    ['KL-001', 'Maria Huber', 'Bahnhofstrasse 12, 8001 Zürich', '+41 44 111 22 33', 'Morgens bevorzugt', 'Aktiv', ''],
    ['KL-002', 'Peter Meier', 'Seestrasse 45, 8002 Zürich', '+41 44 222 33 44', 'Schlüsselbox vorhanden', 'Aktiv', ''],
    ['KL-003', 'Ruth Frei', 'Dorfweg 8, 8050 Zürich', '+41 44 333 44 55', 'Medikamente kontrollieren', 'Aktiv', '']
  ];
  sampleClients.forEach((client, index) => {
    sheet.getRow(index + 2).values = client;
  });

  for (let row = 2; row <= MAX_CLIENT_ROWS + 1; row += 1) {
    sheet.getCell(row, 6).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['ActiveStateList']
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
  styleHeaderRow(sheet.getRow(1));
  styleUsedRange(sheet, MAX_CLIENT_ROWS + 1, headers.length);
  sheet.addConditionalFormatting({
    ref: `A2:G${MAX_CLIENT_ROWS + 1}`,
    rules: [
      expressionRule(
        ['$F2="Inaktiv"'],
        {
          fill: fill(COLORS.free),
          font: { color: { argb: 'FF6B7280' } }
        }
      )
    ]
  });
  setupSheetPrint(sheet, 'landscape');

  return sheet;
}

function createDutySheet(
  workbook: ExcelJS.Workbook,
  options: SpitexTemplateOptions
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Dienstplan', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
  });

  const staffStartColumn = 3;
  const staffEndColumn = staffStartColumn + options.staffSlots - 1;
  const holidayColumn = staffEndColumn + 1;
  const absenceColumn = staffEndColumn + 2;
  const summaryStartColumn = absenceColumn + 2;
  const lastColumn = summaryStartColumn + 3;
  const staffEndLetter = columnLetter(staffEndColumn);
  const lastLetter = columnLetter(lastColumn);

  sheet.getCell(1, 1).value = 'Datum';
  sheet.getCell(1, 2).value = 'Wochentag';
  for (let slot = 1; slot <= options.staffSlots; slot += 1) {
    sheet.getCell(1, staffStartColumn + slot - 1).value = {
      formula: `IFERROR(INDEX(ActiveEmployees,${slot}),"")`
    };
  }
  sheet.getCell(1, holidayColumn).value = 'Feiertag';
  sheet.getCell(1, absenceColumn).value = 'Abwesenheit / Notiz';
  sheet.getCell(1, summaryStartColumn).value = 'Mitarbeiter/in';
  sheet.getCell(1, summaryStartColumn + 1).value = 'Arbeitstage';
  sheet.getCell(1, summaryStartColumn + 2).value = 'Freie Tage';
  sheet.getCell(1, summaryStartColumn + 3).value = 'Wochenenddienste';

  sheet.getColumn(1).width = 13;
  sheet.getColumn(2).width = 15;
  for (let column = staffStartColumn; column <= staffEndColumn; column += 1) {
    sheet.getColumn(column).width = 15;
  }
  sheet.getColumn(holidayColumn).width = 12;
  sheet.getColumn(absenceColumn).width = 24;
  for (let column = summaryStartColumn; column <= lastColumn; column += 1) {
    sheet.getColumn(column).width = column === summaryStartColumn ? 22 : 15;
  }

  for (let row = 2; row <= 32; row += 1) {
    const day = row - 1;
    sheet.getCell(row, 1).value = {
      formula: `IF(ROW()-1<=Einstellungen!$B$6,Einstellungen!$B$5+ROW()-2,"")`,
      result: dateResult(options.year, options.month, day)
    };
    sheet.getCell(row, 2).value = {
      formula: `IF($A${row}="","",TEXT($A${row},"dddd"))`
    };
    sheet.getCell(row, 1).numFmt = 'dd.mm.yyyy';

    for (let column = staffStartColumn; column <= staffEndColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.value = false;
      cell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"TRUE,FALSE"']
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    sheet.getCell(row, holidayColumn).value = false;
    sheet.getCell(row, holidayColumn).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"TRUE,FALSE"']
    };
  }

  for (let row = 2; row <= options.staffSlots + 1; row += 1) {
    const slot = row - 1;
    const employeeCell = `${columnLetter(summaryStartColumn)}${row}`;
    sheet.getCell(row, summaryStartColumn).value = {
      formula: `IFERROR(INDEX($C$1:$${staffEndLetter}$1,${slot}),"")`
    };
    sheet.getCell(row, summaryStartColumn + 1).value = {
      formula: `IF(${employeeCell}="","",SUM(INDEX($C$2:$${staffEndLetter}$32,0,MATCH(${employeeCell},$C$1:$${staffEndLetter}$1,0))))`
    };
    sheet.getCell(row, summaryStartColumn + 2).value = {
      formula: `IF(${employeeCell}="","",COUNT($A$2:$A$32)-${columnLetter(summaryStartColumn + 1)}${row})`
    };
    sheet.getCell(row, summaryStartColumn + 3).value = {
      formula: `IF(${employeeCell}="","",SUMPRODUCT((INDEX($C$2:$${staffEndLetter}$32,0,MATCH(${employeeCell},$C$1:$${staffEndLetter}$1,0))=TRUE)*(WEEKDAY($A$2:$A$32,2)>5)))`
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: lastColumn }
  };
  styleHeaderRow(sheet.getRow(1));
  styleUsedRange(sheet, Math.max(32, options.staffSlots + 1), lastColumn);

  sheet.addConditionalFormatting({
    ref: `A2:${lastLetter}32`,
    rules: [
      expressionRule(['WEEKDAY($A2,2)>5'], { fill: fill(COLORS.weekend) }),
      expressionRule(
        [`OR($${columnLetter(holidayColumn)}2=TRUE,$${columnLetter(absenceColumn)}2<>"")`],
        { fill: fill(COLORS.warning), font: { color: { argb: COLORS.warningText } } }
      )
    ]
  });
  sheet.addConditionalFormatting({
    ref: `C2:${staffEndLetter}32`,
    rules: [
      expressionRule(['C2=TRUE'], { fill: fill(COLORS.work) }),
      expressionRule(['AND(C2=FALSE,$A2<>"")'], { fill: fill(COLORS.free) })
    ]
  });

  setupSheetPrint(sheet, 'landscape');
  return sheet;
}

function createToursSheet(
  workbook: ExcelJS.Workbook,
  options: SpitexTemplateOptions
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Tourenplan', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const headers = [
    'Datum',
    'Wochentag',
    'Mitarbeiter/in',
    'Klient/in',
    'Adresse',
    'Startzeit beim Klienten',
    'Dauer in Minuten',
    'Endzeit automatisch berechnet',
    'Leistung / Aufgabe',
    'Bemerkung',
    'Status',
    'Warnung'
  ];
  sheet.getRow(1).values = headers;
  sheet.columns = [
    { width: 13 },
    { width: 15 },
    { width: 24 },
    { width: 26 },
    { width: 34 },
    { width: 18 },
    { width: 15 },
    { width: 20 },
    { width: 28 },
    { width: 28 },
    { width: 14 },
    { width: 46 }
  ];

  const staffEndColumn = 2 + options.staffSlots;
  const staffEndLetter = columnLetter(staffEndColumn);

  for (let row = 2; row <= options.tourRows + 1; row += 1) {
    sheet.getCell(row, 1).dataValidation = {
      type: 'date',
      operator: 'between',
      allowBlank: true,
      formulae: ['Einstellungen!$B$5', 'EOMONTH(Einstellungen!$B$5,0)'],
      showErrorMessage: true,
      errorTitle: 'Datum ausserhalb des Monats',
      error: 'Bitte ein Datum aus dem eingestellten Planungsmonat wählen.'
    };
    sheet.getCell(row, 1).numFmt = 'dd.mm.yyyy';

    sheet.getCell(row, 2).value = {
      formula: `IF($A${row}="","",TEXT($A${row},"dddd"))`
    };
    sheet.getCell(row, 3).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['ActiveEmployees']
    };
    sheet.getCell(row, 4).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['ActiveClients']
    };
    sheet.getCell(row, 5).value = {
      formula: `IFERROR(VLOOKUP($D${row},Klienten!$B$2:$C$201,2,FALSE),"")`
    };
    sheet.getCell(row, 6).numFmt = 'hh:mm';
    sheet.getCell(row, 7).numFmt = '0';
    sheet.getCell(row, 8).value = {
      formula: `IF(OR($F${row}="",$G${row}=""),"",$F${row}+$G${row}/1440)`
    };
    sheet.getCell(row, 8).numFmt = 'hh:mm';
    sheet.getCell(row, 11).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['StatusList']
    };
    sheet.getCell(row, 12).value = {
      formula: `IF(OR($A${row}="",$C${row}=""),"",IF(IFERROR(INDEX(Dienstplan!$C$2:$${staffEndLetter}$32,MATCH($A${row},Dienstplan!$A$2:$A$32,0),MATCH($C${row},Dienstplan!$C$1:$${staffEndLetter}$1,0)),FALSE)=TRUE,"","Mitarbeiter ist an diesem Tag nicht im Dienstplan eingeteilt"))`
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length }
  };
  styleHeaderRow(sheet.getRow(1));
  styleUsedRange(sheet, options.tourRows + 1, headers.length);
  sheet.addConditionalFormatting({
    ref: `A2:L${options.tourRows + 1}`,
    rules: [
      expressionRule(['$L2<>""'], {
        fill: fill(COLORS.warning),
        font: { color: { argb: COLORS.warningText } }
      }),
      expressionRule(['WEEKDAY($A2,2)>5'], { fill: fill(COLORS.weekend) })
    ]
  });
  sheet.addConditionalFormatting({
    ref: `K2:K${options.tourRows + 1}`,
    rules: [
      expressionRule(['$K2="Geplant"'], { fill: fill(COLORS.statusPlanned) }),
      expressionRule(['$K2="Erledigt"'], { fill: fill(COLORS.statusDone) }),
      expressionRule(['$K2="Verschoben"'], { fill: fill(COLORS.statusMoved) }),
      expressionRule(['$K2="Abgesagt"'], { fill: fill(COLORS.statusCanceled) })
    ]
  });

  setupSheetPrint(sheet, 'landscape');
  return sheet;
}

function createDashboardSheet(
  workbook: ExcelJS.Workbook,
  options: SpitexTemplateOptions
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Dashboard', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  sheet.columns = [
    { width: 34 },
    { width: 16 },
    { width: 4 },
    { width: 26 },
    { width: 16 },
    { width: 16 },
    { width: 16 }
  ];

  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'Dashboard Spitex Einsatzplanung';
  sheet.getCell('A1').fill = fill(COLORS.header);
  sheet.getCell('A1').font = { bold: true, color: { argb: COLORS.primaryText }, size: 15 };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

  const metrics: Array<[string, string]> = [
    ['Planungsmonat', 'Einstellungen!$B$4&" "&Einstellungen!$B$3'],
    ['Anzahl aktive Mitarbeitende', 'COUNTIF(Mitarbeitende!$G:$G,"Aktiv")'],
    ['Anzahl aktive Klienten', 'COUNTIF(Klienten!$F:$F,"Aktiv")'],
    ['Anzahl geplante Touren', 'COUNTIFS(Tourenplan!$K:$K,"Geplant",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0))'],
    ['Anzahl erledigte Touren', 'COUNTIFS(Tourenplan!$K:$K,"Erledigt",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0))'],
    ['Anzahl verschobene Touren', 'COUNTIFS(Tourenplan!$K:$K,"Verschoben",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0))'],
    ['Anzahl abgesagte Touren', 'COUNTIFS(Tourenplan!$K:$K,"Abgesagt",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0))'],
    [
      'Anzahl Warnungen im Tourenplan',
      'COUNTIFS(Tourenplan!$L:$L,"<>",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0))'
    ]
  ];

  metrics.forEach(([label, formula], index) => {
    const row = index + 3;
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold: true };
    sheet.getCell(row, 2).value = { formula };
  });

  sheet.mergeCells('D3:G3');
  sheet.getCell('D3').value = 'Übersicht pro Mitarbeiter/in';
  sheet.getCell('D3').fill = fill(COLORS.subHeader);
  sheet.getCell('D3').font = { bold: true };
  sheet.getCell('D3').alignment = { horizontal: 'center' };

  sheet.getRow(4).getCell(4).value = 'Mitarbeiter/in';
  sheet.getRow(4).getCell(5).value = 'Arbeitstage';
  sheet.getRow(4).getCell(6).value = 'Touren';
  sheet.getRow(4).getCell(7).value = 'Warnungen';
  for (let col = 4; col <= 7; col += 1) {
    const cell = sheet.getCell(4, col);
    cell.fill = fill(COLORS.header);
    cell.font = { bold: true, color: { argb: COLORS.primaryText } };
    cell.alignment = { horizontal: 'center' };
  }

  const staffEndColumn = 2 + options.staffSlots;
  const staffEndLetter = columnLetter(staffEndColumn);
  for (let row = 5; row <= options.staffSlots + 4; row += 1) {
    const slot = row - 4;
    const employeeCell = `D${row}`;
    sheet.getCell(row, 4).value = { formula: `IFERROR(INDEX(ActiveEmployees,${slot}),"")` };
    sheet.getCell(row, 5).value = {
      formula: `IF(${employeeCell}="","",SUM(INDEX(Dienstplan!$C$2:$${staffEndLetter}$32,0,MATCH(${employeeCell},Dienstplan!$C$1:$${staffEndLetter}$1,0))))`
    };
    sheet.getCell(row, 6).value = {
      formula: `IF(${employeeCell}="","",COUNTIFS(Tourenplan!$C:$C,${employeeCell},Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0)))`
    };
    sheet.getCell(row, 7).value = {
      formula: `IF(${employeeCell}="","",COUNTIFS(Tourenplan!$C:$C,${employeeCell},Tourenplan!$L:$L,"<>",Tourenplan!$A:$A,">="&Einstellungen!$B$5,Tourenplan!$A:$A,"<="&EOMONTH(Einstellungen!$B$5,0)))`
    };
  }

  styleUsedRange(sheet, Math.max(12, options.staffSlots + 4), 7);
  for (let row = 3; row <= 10; row += 1) {
    sheet.getCell(row, 1).fill = fill(COLORS.headerLight);
  }
  sheet.addConditionalFormatting({
    ref: `G5:G${options.staffSlots + 4}`,
    rules: [
      expressionRule(['G5>0'], {
        fill: fill(COLORS.warning),
        font: { color: { argb: COLORS.warningText } }
      })
    ]
  });
  setupSheetPrint(sheet, 'landscape');
  return sheet;
}

export function createSpitexTemplateWorkbook(input: SpitexTemplateOptions): ExcelJS.Workbook {
  conditionalFormattingPriority = 1;

  const options: SpitexTemplateOptions = {
    year: clampInteger(input.year, 2024, 2035),
    month: clampInteger(input.month, 1, 12),
    staffSlots: clampInteger(input.staffSlots, 4, 30),
    tourRows: clampInteger(input.tourRows, 100, 1500)
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Besmir Spitex Einsatzplanung';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  createDashboardSheet(workbook, options);
  createDutySheet(workbook, options);
  createToursSheet(workbook, options);
  createEmployeesSheet(workbook);
  createClientsSheet(workbook);
  createSettingsSheet(workbook, options);
  createHelperSheet(workbook);
  addWorkbookNames(workbook);

  return workbook;
}
