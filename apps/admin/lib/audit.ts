/**
 * Admin audit writer (Phase 7F) — SERVER ONLY.
 *
 * Every mutating admin action must call `writeAudit`. The summary is recursively
 * scrubbed of forbidden keys (secrets, tokens, passwords, payment/provider ids,
 * raw answers) so audit rows can never accumulate sensitive data. Writes go
 * through the service-role `admin_log` RPC into the append-only admin_audit_log.
 */

import { adminClient } from './supabase';
import type { AdminContext } from './auth';

const FORBIDDEN = new Set<string>([
  'password', 'token', 'auth_token', 'access_token', 'refresh_token', 'jwt',
  'secret', 'service_role', 'api_key', 'apikey', 'authorization',
  'receipt', 'purchase_token', 'transaction_id', 'customer_id', 'card', 'card_number',
  'revenuecat_app_user_id', 'app_user_id',
  'correct_answer', 'answer_payload', 'submitted_answer', 'private_answer', 'seed',
  'email', // audit references users by UUID, never email
]);

/** Recursively drop forbidden keys from an audit summary. */
export function scrubSummary(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSummary);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN.has(k)) { out[k] = '[redacted]'; continue; }
      out[k] = scrubSummary(v);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary?: Record<string, unknown>;
  reason?: string | null;
  requestId?: string | null;
  ipHash?: string | null;
  success?: boolean;
  approvalRef?: string | null;
}

export async function writeAudit(ctx: AdminContext, input: AuditInput): Promise<void> {
  const svc = adminClient();
  await svc.rpc('admin_log', {
    p_admin: ctx.userId,
    p_role: ctx.role,
    p_action: input.action,
    p_target_type: input.targetType ?? null,
    p_target_id: input.targetId ?? null,
    p_summary: scrubSummary(input.summary ?? {}),
    p_reason: input.reason ?? null,
    p_request_id: input.requestId ?? null,
    p_ip_hash: input.ipHash ?? null,
    p_success: input.success ?? true,
    p_approval_ref: input.approvalRef ?? null,
  });
}
