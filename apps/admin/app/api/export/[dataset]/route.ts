/**
 * Privacy-safe CSV export (Phase 7H) — SERVER route handler.
 *
 * Role-gated (export_reports), field-allowlisted per dataset, row-capped, audited,
 * and CSV-injection-safe. Only AGGREGATE datasets — never emails, UUIDs (for
 * investor scope), tokens, answers, provider ids, or audit IP hashes.
 */

import { NextResponse } from 'next/server';

import { getAdminContext } from '@/lib/auth';
import { adminClient } from '@/lib/supabase';
import { writeAudit } from '@/lib/audit';
import { roleCan } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 5000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Each dataset: how to fetch + the exact columns allowed out.
const DATASETS: Record<string, { fields: string[]; fetch: (svc: ReturnType<typeof adminClient>, from: string, to: string) => Promise<Record<string, unknown>[]> }> = {
  'gameplay-daily': {
    fields: ['day', 'ranked_starts', 'ranked_completions', 'practice_starts', 'practice_completions', 'avg_score', 'median_score'],
    fetch: async (svc, from, to) => ((await svc.rpc('admin_gameplay_daily', { p_from: from, p_to: to })).data ?? []) as Record<string, unknown>[],
  },
  'user-daily': {
    fields: ['day', 'new_users', 'new_permanent', 'new_anonymous', 'active_users'],
    fetch: async (svc, from, to) => ((await svc.rpc('admin_user_daily', { p_from: from, p_to: to })).data ?? []) as Record<string, unknown>[],
  },
  'engine': {
    fields: ['engine_id', 'exposures', 'unique_players', 'completions', 'avg_points', 'perfect_rate', 'zero_rate'],
    fetch: async (svc, from, to) => ((await svc.rpc('admin_engine_stats', { p_from: from, p_to: to })).data ?? []) as Record<string, unknown>[],
  },
  'content-inventory': {
    fields: ['engine_id', 'category', 'active', 'approved_puzzles', 'reserve_puzzles', 'scheduled_slots'],
    fetch: async (svc) => ((await svc.rpc('admin_engine_registry')).data ?? []) as Record<string, unknown>[],
  },
};

/** Neutralize CSV/formula injection and quote-escape a cell. */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;      // formula-injection guard
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!roleCan(ctx.role, 'export_reports')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { dataset } = await params;
  const spec = DATASETS[dataset];
  if (!spec) return NextResponse.json({ error: 'unknown_dataset' }, { status: 404 });

  const url = new URL(req.url);
  const today = Date.now();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : iso(today);
  let from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : iso(today - 89 * DAY);
  if (Date.parse(to) - Date.parse(from) > 400 * DAY) from = iso(Date.parse(to) - 400 * DAY); // range cap

  const rows = (await spec.fetch(adminClient(), from, to)).slice(0, MAX_ROWS);
  const header = spec.fields.join(',');
  const body = rows.map((r) => spec.fields.map((f) => cell(r[f])).join(',')).join('\n');
  const meta = `# BrainBrew export: ${dataset} | range ${from}..${to} UTC | generated ${new Date().toISOString()} | rows ${rows.length}`;
  const csv = `﻿${meta}\n${header}\n${body}\n`; // UTF-8 BOM

  await writeAudit(ctx, { action: 'export_csv', targetType: 'export', targetId: dataset, summary: { dataset, from, to, rows: rows.length }, reason: 'dashboard export' });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="brainbrew_${dataset}_${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
