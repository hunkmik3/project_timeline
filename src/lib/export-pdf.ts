import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { MonthBlock } from './calendar';
import type { OffDayResolver, Task, TaskCategory } from './types';
import { WEEKDAY_HEADERS, formatDate } from './date';
import { countWorkingDays, effectiveCategoryId, resolveTaskColors } from './calendar';

const TITLE_FILL = '#00FF00';
const HEADER_FILL = '#00FFFF';
const OFF_FILL = '#1F4E5A';
const BORDER = '#BFBFBF';

const COLS = 7;
const MARGIN = 30;
/** Rows stop growing past this so a quiet month does not look stretched. */
const MAX_ROW_HEIGHT = 40;

/** Type scales with the row so a light month is not set in tiny print. */
const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * PDFKit's built-in fonts are WinAnsi only: "Tết Nguyên Đán" comes out as
 * "T ¿t Nguyên â r". Task names and holiday names are both Vietnamese, so a
 * full TTF has to be embedded. Subset files (the @fontsource "vietnamese"
 * split) are no good either — they carry the diacritics but not the letters.
 */
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

let cached: { regular: Buffer; bold: Buffer; italic: Buffer } | null = null;
function fonts() {
  if (!cached) {
    cached = {
      regular: fs.readFileSync(path.join(FONT_DIR, 'BeVietnamPro-Regular.ttf')),
      bold: fs.readFileSync(path.join(FONT_DIR, 'BeVietnamPro-Bold.ttf')),
      italic: fs.readFileSync(path.join(FONT_DIR, 'BeVietnamPro-Italic.ttf')),
    };
  }
  return cached;
}

export async function buildPdf(opts: {
  title: string;
  blocks: MonthBlock[];
  tasks: Task[];
  categories: TaskCategory[];
  isOff: OffDayResolver;
}): Promise<Buffer> {
  const { title, blocks, tasks, categories, isOff } = opts;
  const { regular, bold, italic } = fonts();

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN });
  doc.registerFont('body', regular);
  doc.registerFont('bold', bold);
  doc.registerFont('italic', italic);
  doc.info.Title = title;

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const gridW = pageW - MARGIN * 2;
  const colW = gridW / COLS;

  /** Draw a filled, bordered cell with centred text that never wraps. */
  const cell = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    o: { fill?: string; color?: string; size?: number; font?: 'body' | 'bold' | 'italic' } = {},
  ) => {
    if (o.fill) doc.rect(x, y, w, h).fill(o.fill);
    doc.rect(x, y, w, h).lineWidth(0.5).stroke(BORDER);
    if (!text) return;
    const size = o.size ?? 8;
    doc
      .font(o.font ?? 'body')
      .fontSize(size)
      .fillColor(o.color ?? '#000000')
      .text(text, x + 2, y + (h - size) / 2 - 1, {
        width: w - 4,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
  };

  // PDFKit opens with a page already created, so the first section draws onto
  // it and only later ones add one — otherwise the file starts with a blank.
  let pageStarted = false;

  blocks.forEach((block, index) => {
    if (pageStarted) doc.addPage();
    pageStarted = true;

    let top = MARGIN;

    if (index === 0) {
      doc.rect(MARGIN, top, Math.min(220, gridW), 18).fill(TITLE_FILL);
      doc
        .font('bold')
        .fontSize(10)
        .fillColor('#000000')
        .text(title, MARGIN + 6, top + 5, { width: 208, lineBreak: false, ellipsis: true });
      top += 26;
    }

    doc
      .font('bold')
      .fontSize(16)
      .fillColor('#111111')
      .text(block.label, MARGIN, top, { width: gridW, align: 'center' });
    top += 24;

    // One row for the weekday header, then per week a dates row plus its lanes.
    // Lane rows carry the task name and its note, so they take the bigger
    // share; date rows only hold a number.
    // A note can run to several lines, and the row has to grow to hold them or
    // the text is clipped. Taking the longest note in the month keeps every lane
    // the same height — varying them per lane would mean tracking a separate
    // offset for every row. Capped at three lines so a very long note cannot
    // squeeze the date rows away.
    const noteLines = Math.min(
      3,
      Math.max(
        1,
        ...block.weeks.flatMap((wk) =>
          wk.placed.map((pl) => (pl.task.note?.trim() ? pl.task.note.trim().split('\n').length : 1)),
        ),
      ),
    );
    const BASE_LANE_RATIO = 1.35 / 0.85;
    const LANE_RATIO = BASE_LANE_RATIO * (1 + 0.5 * (noteLines - 1));
    const dateRows = 1 + block.weeks.length;
    const laneRows = block.weeks.reduce((n, w) => n + w.laneCount, 0);
    const unit = Math.min(
      // The cap is on the base unit, not the note-widened lane: capping the
      // lane itself held it at 40pt, too short for a name plus three lines,
      // and the note was clipped to one however much room the page had.
      MAX_ROW_HEIGHT / BASE_LANE_RATIO,
      (pageH - MARGIN - top) / (dateRows + laneRows * LANE_RATIO),
    );
    const dateH = unit;
    const laneH = unit * LANE_RATIO;
    const daySize = clamp(6, dateH * 0.42, 10);
    const nameSize = clamp(6.5, laneH * 0.36, 12);
    const noteSize = clamp(5.5, laneH * 0.26, 9);

    WEEKDAY_HEADERS.forEach((label, i) => {
      const sunday = i === COLS - 1;
      cell(label, MARGIN + i * colW, top, colW, dateH, {
        fill: sunday ? OFF_FILL : HEADER_FILL,
        color: sunday ? '#FFFFFF' : '#000000',
        size: daySize,
      });
    });

    let y = top + dateH;

    for (const week of block.weeks) {
      week.days.forEach((day, i) => {
        cell(day.day ? String(day.day) : '', MARGIN + i * colW, y, colW, dateH, {
          fill: day.date && day.isOff ? OFF_FILL : undefined,
          color: day.date && day.isOff ? '#FFFFFF' : '#333333',
          size: daySize,
        });
      });
      y += dateH;

      const laneTop = y;
      for (let lane = 0; lane < week.laneCount; lane += 1) {
        week.days.forEach((day, i) => {
          cell('', MARGIN + i * colW, laneTop + lane * laneH, colW, laneH, {
            fill: day.date && day.isOff ? OFF_FILL : undefined,
          });
        });
      }

      for (const placed of week.placed) {
        for (const seg of placed.segments) {
          const x = MARGIN + seg.startCol * colW;
          const w = (seg.endCol - seg.startCol + 1) * colW;
          const boxY = laneTop + placed.lane * laneH;
          const note = placed.task.note?.trim();

          cell('', x, boxY, w, laneH, { fill: placed.color });

          // Measure both pieces first, then draw. Every measurement and every
          // draw sets its own font: PDFKit keeps the last one, and leaving the
          // italic from the note measurement in place rendered the name italic.
          const textW = w - 4;

          doc.font('bold').fontSize(nameSize);
          const nameLine = doc.currentLineHeight();
          // One line for the name when a note follows it, so the note gets the
          // rest of the row; two when the name is alone.
          const nameH = Math.min(
            doc.heightOfString(placed.task.name, { width: textW }),
            nameLine * (note ? 1 : 2),
          );

          let noteH = 0;
          if (note) {
            doc.font('italic').fontSize(noteSize);
            noteH = Math.min(
              doc.heightOfString(note, { width: textW }),
              Math.max(0, laneH - nameH - 4),
            );
          }

          const blockH = note ? nameH + noteH + 2 : nameH;
          const top0 = boxY + Math.max(1, (laneH - blockH) / 2);

          doc
            .font('bold')
            .fontSize(nameSize)
            .fillColor(placed.textColor)
            .text(placed.task.name, x + 2, top0, {
              width: textW,
              height: nameH,
              align: 'center',
              ellipsis: true,
            });

          if (note) {
            doc
              .font('italic')
              .fontSize(noteSize)
              .fillColor(placed.textColor)
              .opacity(0.8)
              .text(note, x + 2, top0 + nameH + 2, {
                width: textW,
                height: noteH,
                align: 'center',
                ellipsis: true,
              })
              .opacity(1);
          }
        }
      }

      y = laneTop + week.laneCount * laneH;
    }
  });

  // ---------- Task list, for whoever is reading this on paper ----------
  const listed = [...tasks].sort((a, b) => a.start.localeCompare(b.start));
  if (listed.length > 0) {
    if (pageStarted) doc.addPage();
    pageStarted = true;
    doc.font('bold').fontSize(14).fillColor('#111111').text('TASKS', MARGIN, MARGIN);

    const cols = [
      { label: 'TASK', w: gridW * 0.2 },
      { label: 'TYPE', w: gridW * 0.12 },
      { label: 'START', w: gridW * 0.11 },
      { label: 'END', w: gridW * 0.11 },
      { label: 'DAYS', w: gridW * 0.07 },
      { label: 'NOTE', w: gridW * 0.33 },
      { label: 'COLOUR', w: gridW * 0.06 },
    ];

    let y = MARGIN + 26;
    const rowH = 18;
    let x = MARGIN;
    cols.forEach((c) => {
      cell(c.label, x, y, c.w, rowH, { fill: '#D9D9D9', font: 'bold' });
      x += c.w;
    });
    y += rowH;

    for (const task of listed) {
      if (y + rowH > pageH - MARGIN) {
        doc.addPage();
        y = MARGIN;
      }
      const { color } = resolveTaskColors(task, categories);
      const cat = categories.find((c) => c.id === effectiveCategoryId(task, categories));
      // The calendar block clips a long note to the row; the full text lives
      // here, with its line breaks flattened so it stays on one row.
      const values = [
        task.name,
        cat?.name ?? '',
        formatDate(task.start),
        formatDate(task.end),
        String(countWorkingDays(task, isOff)),
        (task.note ?? '').replace(/\s*\n\s*/g, ' · '),
      ];

      x = MARGIN;
      values.forEach((v, i) => {
        cell(v, x, y, cols[i].w, rowH, { size: 8 });
        x += cols[i].w;
      });
      cell('', x, y, cols[6].w, rowH, { fill: color });
      y += rowH;
    }
  }

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
