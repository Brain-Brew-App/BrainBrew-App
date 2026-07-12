/**
 * Edge middleware — per-request nonce CSP + Supabase session refresh.
 *
 * CRITICAL (Phase 7H.1 fix): when Supabase refreshes+rotates the session token in
 * middleware, the new cookies must be written to BOTH the response (for the
 * browser) AND the forwarded REQUEST (so the same-request Server Component render
 * reads the fresh access token). The 7H version only wrote the response, so after
 * a refresh the page saw the old, now-rotated refresh token and bounced valid
 * admins to /login — intermittently, only in a browser with a session older than
 * the access-token TTL (hence "works in Incognito, fails in the normal browser").
 * This is the officially-documented @supabase/ssr Next.js pattern.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/denied', '/account'];

function buildCsp(nonce: string): string {
  const prod = process.env.NODE_ENV === 'production';
  return [
    "default-src 'self'",
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

export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // Nonce + CSP travel on the REQUEST headers so Next stamps its scripts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return response;

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        // (1) reflect the refreshed cookies into the forwarded request so THIS
        // request's page render sees the fresh session (no double refresh / rotation race)…
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        requestHeaders.set('cookie', req.cookies.getAll().map((c) => `${c.name}=${c.value}`).join('; '));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set('Content-Security-Policy', csp);
        // …and (2) write them to the response so the browser stores them.
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser(); // refreshes if needed; cookies propagate via setAll
  if (!user) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    const redirectRes = NextResponse.redirect(to);
    redirectRes.headers.set('Content-Security-Policy', csp);
    response.cookies.getAll().forEach((c) => redirectRes.cookies.set(c)); // carry cleared/refreshed cookies
    return redirectRes;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
