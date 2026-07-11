import { OrderingInput } from '../components/OrderingInput';
import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS } from '../theme/theme';
import type { SentenceOrderingPuzzle } from '../types/puzzle';
import type { EngineProps } from './types';

/**
 * `LNG_003` Sentence Ordering — four fragments make one sentence.
 *
 * The purest expression of "language logic": no vocabulary, no trivia, just the
 * shape of a sentence. Solvable from capitalisation, the full stop, connectives
 * and pronoun reference alone.
 *
 * Reuses `OrderingInput` from `LOG_003` — one component, two engines, two
 * categories.
 */
export function SentenceOrderingEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<SentenceOrderingPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="language-logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <OrderingInput
        items={puzzle.fragments}
        correctOrder={puzzle.correctOrder}
        revealed={revealed}
        accent={CATEGORY_ACCENTS['language-logic']}
        hint="Tap the fragments in reading order."
        onComplete={(orderedIds) =>
          onAnswer({ kind: 'sequence', selectedIds: orderedIds, elapsedMs: elapsed() })
        }
      />
    </PuzzleFrame>
  );
}
