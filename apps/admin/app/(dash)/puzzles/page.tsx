import { requireCapability } from '@/lib/auth';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PuzzlesPage() {
  await requireCapability('view_puzzles');
  return (
    <>
      <h1>Puzzles</h1>
      <Empty>Read-only puzzle drill-down (score/solve-time distributions, validation + incident status, exposure) is planned for the next content-operations build-out. RBAC and analytics RPCs are in place; no fabricated data is shown.</Empty>
    </>
  );
}
