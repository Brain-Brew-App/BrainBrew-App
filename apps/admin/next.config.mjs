/**
 * BrainBrew Admin — Next.js config. Security headers apply to every route.
 * The admin dashboard must never be indexed and never be framed.
 *
 * The service-role key and Management token are read ONLY in server code
 * (Route Handlers / Server Actions / Server Components) and are never exposed as
 * NEXT_PUBLIC_* — so they never reach the browser bundle.
 */

const isProd = process.env.NODE_ENV === 'production';

// The Content-Security-Policy is generated PER REQUEST in middleware.ts with a
// nonce (Next.js needs its inline bootstrap scripts allowed via a nonce rather
// than a blanket 'unsafe-inline'). The remaining, static security headers live
// here and apply to every route.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false, // don't ship server-adjacent source maps
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
