/**
 * Registry-driven authoring-form schema types (Phase 7H.3.2, Task 1).
 *
 * Each engine contributes DATA (an `EngineFormSchema`), never a bespoke form
 * component. A single generic form renderer walks `fieldGroups` and binds the
 * shared primitives; a single generic preview renderer walks the `PreviewModel`.
 * This is what lets the remaining nine engines be added as data, not code.
 *
 * These types are pure (no React, no JSX) so the schemas are exhaustively testable
 * in plain Node — see scripts/authoring-engine-forms-test.mjs.
 */

export type FieldKind =
  | 'number'
  | 'select'
  | 'glyph'
  | 'glyph-multi'
  | 'difficulty'
  | 'index-pair'
  | 'matrix-rule';

export interface FieldOption {
  value: string;
  label: string;
  /** Optional glyph/preview shown next to the label (glyph/select pickers). */
  glyph?: string;
}

export interface FieldDescriptor {
  /** Dotted path into the flat form state (e.g. "majority", "at.0"). */
  key: string;
  kind: FieldKind;
  label: string;
  help?: string;
  required: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: FieldOption[];
  /** For glyph/glyph-multi: the approved source alphabet (no free Unicode entry). */
  glyphSource?: string[];
  /** For glyph-multi: exact number of selections required (null = variable). */
  selectCount?: number | null;
}

export interface FieldGroup {
  title: string;
  description?: string;
  fields: FieldDescriptor[];
}

/** A normalized, gameplay-safe view model the generic <Preview> renders. */
export type PreviewModel =
  | {
      kind: 'tile-grid';
      columns: number;
      tiles: { glyph: string; highlight?: boolean }[];
      renderRisk?: string[];
    }
  | {
      kind: 'shape-options';
      target: string[];
      options: { id: string; cells: string[]; correct?: boolean }[];
    }
  | {
      kind: 'chip-sequence';
      sequence: string[];
      options: { id: string; label: string; correct?: boolean }[];
    }
  | {
      kind: 'matrix';
      cells: (string | null)[];
      options: { id: string; label: string; correct?: boolean }[];
    }
  | {
      kind: 'chip-repair';
      terms: string[];
      wrongIndex?: number;
    };

/** Result of the client-side usability pre-check (the SERVER remains authoritative). */
export interface ClientCheck {
  ok: boolean;
  /** Field-keyed messages for inline display. */
  fieldErrors: Record<string, string>;
  /** Non-field-specific messages. */
  formErrors: string[];
}

/**
 * A public payload as returned by the canonical build (answer already split out).
 * The preview adapter reads it plus, optionally, the authorized answer overlay.
 */
export interface EngineFormSchema<Form = Record<string, unknown>, Seed = Record<string, unknown>> {
  engineId: string;
  category: string;
  displayName: string;
  schemaVersion: number;
  /** A known-valid form state (its serialized seed builds + validates clean). */
  defaultForm: Form;
  fieldGroups: FieldGroup[];
  /** Flat editable form state → the canonical typed seed. */
  serializeFormToSeed(form: Form, id: string): Seed;
  /** A canonical seed → editable form state (for loading a draft). */
  deserializeSeedToForm(seed: Seed): Form;
  /** Client usability pre-check. Never the source of truth — build/validate is. */
  clientValidate(form: Form): ClientCheck;
  /**
   * Build a safe PreviewModel from the canonical public payload (+ optional
   * authorized answer). Throws on a malformed payload (tested).
   */
  previewAdapter(publicPayload: Record<string, unknown>, answer?: Record<string, unknown>): PreviewModel;
  helpText: string;
  accessibilityNotes: string[];
  smallScreenNotes: string[];
  /** Approved curated input sources named for the UI (glyph sets, families…). */
  approvedInputs: string[];
}

/** Unknown fields on a form are a hard error — reject, never silently drop. */
export function rejectUnknownFields(form: object, allowedKeys: string[]): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(form).filter((k) => !allowed.has(k));
}
