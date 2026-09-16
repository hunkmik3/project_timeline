import ExcelJS from 'exceljs';
import type { MonthBlock } from './calendar';
import type { Holiday, OffDayResolver, Task, TaskCategory } from './types';
import { WEEKDAY_HEADERS, formatDate } from './date';
import { effectiveCategoryId, resolveTaskColors } from './calendar';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase().padStart(6, '0')}`;

const TITLE_FILL = '00FF00';
const HEADER_FILL = '00FFFF';
const OFF_FILL = '1F4E5A';
const OFF_TEXT = 'FFFFFF';

const COLS = 7;

function solidFill(hex: string): ExcelJS.FillPattern {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  return { top: side, left: side, bottom: side, right: side };
}

function centered(): Partial<ExcelJS.Alignment> {
  return { horizontal: 'center', vertical: 'middle', wrapText: false };
}

export async function buildWorkbook(opts: {
  title: string;
  blocks: MonthBlock[];
  tasks: Task[];
  categories: TaskCategory[];
  isOff: OffDayResolver;
  holidays: Holiday[];
}): Promise<ArrayBuffer> {
  const { title, blocks, tasks, categories, isOff, holidays } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Project Timeline';
  wb.created = new Date();

  // ---------- Sheet 1: TIMELINE ----------
  const ws = wb.addWorksheet('TIMELINE', {
    views: [{ showGridLines: false }],
  });
  for (let c = 1; c <= COLS; c += 1) ws.getColumn(c).width = 17;

  let r = 2;

  ws.mergeCells(r, 1, r, 5);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12 };
  titleCell.fill = solidFill(TITLE_FILL);
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(r).height = 20;
  r += 2;

  for (const block of blocks) {
    // Month heading
    r += 1;
    ws.mergeCells(r, 1, r, COLS);
    const monthCell = ws.getCell(r, 1);
    monthCell.value = block.label;
    monthCell.font = { bold: true, size: 14 };
    monthCell.alignment = centered();
    ws.getRow(r).height = 24;
    r += 2;

    // Mon..Sun header row
    const headerRow = ws.getRow(r);
    headerRow.height = 18;
    for (let c = 0; c < COLS; c += 1) {
      const cell = ws.getCell(r, c + 1);
      cell.value = WEEKDAY_HEADERS[c];
      cell.alignment = centered();
      cell.border = thinBorder();
      const sundayColumn = c === COLS - 1;
      cell.fill = solidFill(sundayColumn ? OFF_FILL : HEADER_FILL);
      cell.font = { bold: false, size: 9, color: { argb: argb(sundayColumn ? OFF_TEXT : '000000') } };
    }
    r += 1;

    for (const week of block.weeks) {
      // Date numbers row
      const dateRow = ws.getRow(r);
      dateRow.height = 18;
      for (let c = 0; c < COLS; c += 1) {
        const cell = ws.getCell(r, c + 1);
        const day = week.days[c];
        cell.value = day.day ?? null;
        cell.alignment = centered();
        cell.border = thinBorder();
        // Smaller than the task name: the name is what the sheet is read for.
        cell.font = {
          size: 9,
          color: { argb: argb(day.date && day.isOff ? OFF_TEXT : '000000') },
        };
        if (day.date && day.isOff) cell.fill = solidFill(OFF_FILL);
      }
      r += 1;

      // Lane rows holding the task blocks
      const laneStart = r;
      // A note adds a second line inside the cell, so that lane needs the height.
      const laneHasNote = new Set(
        week.placed.filter((p) => p.task.note?.trim()).map((p) => p.lane),
      );
      for (let lane = 0; lane < week.laneCount; lane += 1) {
        const laneRow = ws.getRow(laneStart + lane);
        laneRow.height = laneHasNote.has(lane) ? 30 : 20;
        for (let c = 0; c < COLS; c += 1) {
          const cell = ws.getCell(laneStart + lane, c + 1);
          cell.border = thinBorder();
          const day = week.days[c];
          if (day.date && day.isOff) cell.fill = solidFill(OFF_FILL);
        }
      }

      for (const placed of week.placed) {
        const row = laneStart + placed.lane;
        for (const seg of placed.segments) {
          if (seg.endCol > seg.startCol) {
            ws.mergeCells(row, seg.startCol + 1, row, seg.endCol + 1);
          }
          const cell = ws.getCell(row, seg.startCol + 1);
          const note = placed.task.note?.trim();
          const textColor = { argb: argb(placed.textColor) };

          cell.value = note
            ? {
                richText: [
                  { text: placed.task.name, font: { bold: true, size: 11, color: textColor } },
                  { text: `\n${note}`, font: { italic: true, size: 9, color: textColor } },
                ],
              }
            : placed.task.name;
          cell.fill = solidFill(placed.color);
          cell.font = { bold: true, size: 11, color: textColor };
          // Always wrap: a long name needs the second line as much as a note does.
          cell.alignment = { ...centered(), wrapText: true };
          cell.border = thinBorder();
        }
      }

      r = laneStart + week.laneCount;
    }

    r += 1;
  }

  // ---------- Sheet 2: DATA ----------
  const data = wb.addWorksheet('DATA');
  data.columns = [
    { header: 'TASK', key: 'name', width: 30 },
    { header: 'TYPE', key: 'cat', width: 18 },
    { header: 'START', key: 'start', width: 16 },
    { header: 'END', key: 'end', width: 16 },
    { header: 'COLOUR', key: 'color', width: 12 },
    { header: 'NOTE', key: 'note', width: 40 },
  ];
  data.getRow(1).font = { bold: true };
  data.getRow(1).fill = solidFill('D9D9D9');

  for (const task of [...tasks].sort((a, b) => a.start.localeCompare(b.start))) {
    const { color } = resolveTaskColors(task, categories);
    // The stored field is usually null because the type is inferred from the
    // name; looking it up directly left this column blank for every task.
    const cat = categories.find((c) => c.id === effectiveCategoryId(task, categories));
    const row = data.addRow({
      name: task.name,
      cat: cat?.name ?? '',
      start: formatDate(task.start),
      end: formatDate(task.end),
      color,
      note: task.note ?? '',
    });
    row.getCell('color').fill = solidFill(color);
  }

  // ---------- Sheet 3: DAYS OFF ----------
  const offSheet = wb.addWorksheet('DAYS OFF');
  offSheet.columns = [
    { header: 'DATE', key: 'date', width: 16 },
    { header: 'NAME', key: 'name', width: 34 },
    { header: 'TYPE', key: 'kind', width: 22 },
    { header: 'CALENDAR TREATS AS', key: 'applied', width: 20 },
  ];
  offSheet.getRow(1).font = { bold: true };
  offSheet.getRow(1).fill = solidFill('D9D9D9');

  for (const h of holidays) {
    offSheet.addRow({
      date: formatDate(h.date),
      name: h.name,
      kind: h.workingDay
        ? 'Make-up workday'
        : h.official
          ? 'Official holiday'
          : 'Unofficial',
      applied: isOff(h.date).off ? 'Day off' : 'Working day',
    });
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
