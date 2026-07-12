import { notFound } from 'next/navigation';

import { requireCapability } from '@/lib/auth';
import { getFormSchema, isAuthorableEngine } from '@/lib/authoring/engines';
import { AuthoringForm, type FormSpec } from '../../AuthoringForm';

export const dynamic = 'force-dynamic';

/**
 * New-puzzle authoring route. Extracts a SERIALIZABLE spec from the (server-side)
 * schema — no functions cross to the client — and renders the generic form.
 */
export default async function NewPuzzlePage({ params }: { params: Promise<{ engineId: string }> }) {
  await requireCapability('manage_content');
  const { engineId } = await params;
  if (!isAuthorableEngine(engineId)) notFound();

  const schema = getFormSchema(engineId);
  const spec: FormSpec = {
    engineId: schema.engineId,
    displayName: schema.displayName,
    category: schema.category,
    schemaVersion: schema.schemaVersion,
    fieldGroups: schema.fieldGroups,
    defaultForm: schema.defaultForm,
    helpText: schema.helpText,
    accessibilityNotes: schema.accessibilityNotes,
    smallScreenNotes: schema.smallScreenNotes,
    approvedInputs: schema.approvedInputs,
  };

  return (
    <div>
      <p className="faint" style={{ marginBottom: 12 }}><a href="/content/authoring">← Authoring</a></p>
      <AuthoringForm spec={spec} />
    </div>
  );
}
