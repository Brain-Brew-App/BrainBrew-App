/**
 * Fetch Supabase Security + Performance Advisor findings for the linked project
 * via the Management API (Phase 4B, Step 4). Uses SUPABASE_ACCESS_TOKEN; prints
 * findings (names/levels/facing) but never a credential.
 *
 *   node scripts/db/with-secrets.mjs node scripts/db/remote-advisors.mjs
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = 'kfcshiktovyjcoepnrfw';
if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(2);
}

async function advisor(kind) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/advisors/${kind}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${kind} advisor HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).lints ?? [];
}

// Findings we treat as blocking. Deliberately EXCLUDES:
//   * rls_enabled_no_policy — our intended deny-by-default posture. RLS is ON
//     with no policy, so anon/authenticated see zero rows; service_role bypasses
//     RLS and anon reads only via the SECURITY DEFINER `get_public_pack` RPC.
//     "RLS enabled, no policy" is a locked door, not a missing one.
//   * anon/authenticated_security_definer_function_executable (get_public_pack) —
//     by design: the RPC is the one public read surface anon must call.
const BLOCKING = new Set([
  'rls_disabled_in_public', 'rls_disabled', 'policy_exists_rls_disabled',
  'security_definer_view', 'function_search_path_mutable', 'exposed_auth_users',
  'exposed_sensitive_data', 'unsupported_reg_types',
]);
const ACCEPTABLE = new Set([
  'rls_enabled_no_policy',
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
]);

let blocking = 0;
for (const kind of ['security', 'performance']) {
  const lints = await advisor(kind);
  console.log(`\n=== ${kind.toUpperCase()} ADVISOR (${lints.length} finding(s)) ===`);
  if (!lints.length) console.log('  (none)');
  for (const l of lints) {
    const isBlock = kind === 'security' && !ACCEPTABLE.has(l.name) && (l.level === 'ERROR' || BLOCKING.has(l.name));
    if (isBlock) blocking++;
    const meta = Array.isArray(l.metadata) ? l.metadata : l.metadata ? [l.metadata] : [];
    const tables = meta.map((m) => m.name ?? m.table ?? '').filter(Boolean).join(', ');
    const tag = isBlock ? '   ← BLOCKING' : ACCEPTABLE.has(l.name) ? '   (acceptable-by-design)' : '';
    console.log(`  [${l.level}] ${l.name}${tables ? ` — ${tables}` : ''}${tag}`);
    if (l.detail) console.log(`        ${String(l.detail).replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

console.log(`\nBlocking security findings: ${blocking}`);
process.exit(blocking > 0 ? 1 : 0);
