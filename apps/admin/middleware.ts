/**
 * Edge middleware — (1) a strict, per-request NONCE-based Content-Security-Policy
 * (Next.js needs its inline bootstrap scripts allowed via a nonce, not blanket
 * 'unsafe-inline'), and (2) an auth gate that redirects unauthenticated requests
 * to /login. The authoritative check is `requireAdmin()` in each server
 * component/action; this is defence in depth + session refresh.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/denied'];

function buildCsp(nonce: string): string {
  const prod = process.env.NODE_ENV === 'production';
  return [
    "default-src 'self'",
    // Nonce + strict-dynamic lets Next's bootstrap scripts run and load their
    // chunks, while still blocking arbitrary injected inline scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${prod ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** Copy the CSP + nonce headers onto any response we return (incl. redirects). */
function withCsp(res: NextResponse, csp: string): NextResponse {
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Pass the nonce + CSP to the render pass so Next applies the nonce to its scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const res = withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);

  const url = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => url.startsWith(p))) return res;

  const supa = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) =>
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    },
  );
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    const redirect = withCsp(NextResponse.redirect(to), csp);
    res.cookies.getAll().forEach((c) => redirect.cookies.set(c)); // preserve refreshed session cookies
    return redirect;
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
