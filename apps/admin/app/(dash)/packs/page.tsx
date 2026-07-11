import { requireCapability } from '@/lib/auth';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PacksPage() {
  await requireCapability('view_packs');
  return (
    <>
      <h1>Daily Packs</h1>
      <Empty>Read-only daily-pack analytics (participation, completion, score distribution, void/recalc state) is planned for the next content-operations build-out. No fabricated data is shown.</Empty>
    </>
  );
}
