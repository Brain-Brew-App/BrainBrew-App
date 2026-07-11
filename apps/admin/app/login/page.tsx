import { LoginForm } from './form';

// Force dynamic rendering so the middleware's per-request CSP nonce is applied to
// Next's inline bootstrap scripts (nonce injection does not happen for statically
// prerendered pages).
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm />;
}
