/**
 * Whether the engine currently has the answer key.
 *
 * Local mode renders full puzzles, so engines show a rich inline reveal (which
 * option was right, which tiles were targets). Cloud mode renders render-safe
 * puzzles — the answer key is absent by design, and the server never returns it —
 * so the inline reveal must degrade to NEUTRAL (show the player's own selection,
 * no true/false marks) and let the RevealCard carry the server verdict. This
 * context is how the shared reveal components (OptionButton, GlyphTile) and the
 * key-dependent engines know which to do.
 *
 * Default `true` preserves existing local behaviour for any engine rendered
 * outside a provider (e.g. tests, storybook).
 */

import { createContext, useContext } from 'react';

const AnswerKeyContext = createContext<boolean>(true);

export const AnswerKeyProvider = AnswerKeyContext.Provider;

/** True when the inline reveal may show correctness; false in cloud mode. */
export function useHasAnswerKey(): boolean {
  return useContext(AnswerKeyContext);
}
