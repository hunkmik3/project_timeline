import { NextResponse } from 'next/server';
import { buildTimeline, makeOffDayResolver } from '@/lib/calendar';
import { buildWorkbook } from '@/lib/export-excel';
import { normalizeProject } from '@/lib/storage';
import type { Holiday } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { project?: unknown; holidays?: Holiday[] };
    const project = normalizeProject(body.project);
    const holidays = Array.isArray(body.holidays) ? body.holidays : [];

    const isOff = makeOffDayResolver(project.offDays, holidays);
    const blocks = buildTimeline(
      project.tasks,
      project.categories,
      isOff,
      project.rangeStart,
      project.rangeEnd,
    );

    const buffer = await buildWorkbook({
      title: project.title,
      blocks,
      tasks: project.tasks,
      categories: project.categories,
      isOff,
      holidays,
    });

    const filename = `${project.title.replace(/[^\w\-]+/g, '_') || 'timeline'}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 },
    );
  }
}
