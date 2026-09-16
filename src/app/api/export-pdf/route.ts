import { NextResponse } from 'next/server';
import { buildTimeline, makeOffDayResolver } from '@/lib/calendar';
import { buildPdf } from '@/lib/export-pdf';
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

    const buffer = await buildPdf({
      title: project.title,
      blocks,
      tasks: project.tasks,
      categories: project.categories,
      isOff,
    });

    const filename = `${project.title.replace(/[^\w\-]+/g, '_') || 'timeline'}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'content-type': 'application/pdf',
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
