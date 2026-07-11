import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrainBrew Admin',
  description: 'Internal operations. Not for public access.',
  robots: { index: false, follow: false, nocache: true },
};

// The whole admin app renders dynamically (per-request) so the middleware CSP
// nonce is applied to Next's scripts and no page is statically cached.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
