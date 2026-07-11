import { requireCapability } from '@/lib/auth';
import { Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  await requireCapability('view_content');
  return (
    <>
      <h1>Content Review</h1>
      <Empty>Read-only content review queue (validator findings, review status, similarity flags) is planned for the next content-operations build-out. Approval actions remain deferred until workflow permissions and audit tests are complete.</Empty>
    </>
  );
}
