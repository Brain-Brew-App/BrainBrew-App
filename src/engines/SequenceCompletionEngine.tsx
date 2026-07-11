import { PuzzleFrame } from '../components/PuzzleFrame';
import { SequenceChips } from '../components/SequenceChips';
import { useElapsed } from '../hooks/useElapsed';
import { CATEGORY_ACCENTS } from '../theme/theme';
import type { SequenceCompletionPuzzle } from '../types/puzzle';
import { MultipleChoice } from './MultipleChoice';
import type { EngineProps } from './types';

/** `PAT_001` Sequence Completion — what comes next? */
export function SequenceCompletionEngine({
  puzzle,
  revealed,
  onAnswer,
}: EngineProps<SequenceCompletionPuzzle>) {
  const elapsed = useElapsed();

  return (
    <PuzzleFrame category="pattern" engine={puzzle.engine} prompt={puzzle.prompt}>
      <MultipleChoice
        accent={CATEGORY_ACCENTS.pattern}
        options={puzzle.options}
        correctOptionId={puzzle.correctOptionId}
        revealed={revealed}
        onSelect={(optionId) =>
          onAnswer({ kind: 'choice', selectedId: optionId, elapsedMs: elapsed() })
        }
        stimulus={<SequenceChips terms={puzzle.sequence} trailingBlank />}
      />
    </PuzzleFrame>
  );
}
