import { PuzzleFrame } from '../components/PuzzleFrame';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS } from '../theme/theme';
import type { OddWordOutPuzzle } from '../types/puzzle';
import { MultipleChoice } from './MultipleChoice';
import type { EngineProps } from './types';

/**
 * `LNG_002` Odd Word Out — three words share a category; tap the one that doesn't.
 *
 * Reasoning through language, never vocabulary recall: every word sits in the
 * common band, and the *relation* carries the difficulty. Uniqueness is proven
 * offline by a leave-one-out check against the puzzle's curated `membership`
 * ontology, never by a model's assertion (Catalog §LNG_002).
 */
export function OddWordOutEngine({ puzzle, revealed, onAnswer }: EngineProps<OddWordOutPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="language-logic" engine={puzzle.engine} prompt={puzzle.prompt}>
      <MultipleChoice
        accent={CATEGORY_ACCENTS['language-logic']}
        options={puzzle.options}
        correctOptionId={puzzle.correctOptionId}
        revealed={revealed}
        onSelect={(optionId) =>
          onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() })
        }
      />
    </PuzzleFrame>
  );
}
