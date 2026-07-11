import type { Answer, Puzzle } from '../types/puzzle';
import { AnalogyEngine } from './AnalogyEngine';
import { BalanceScalesEngine } from './BalanceScalesEngine';
import { DeductionEngine } from './DeductionEngine';
import { MatrixCompletionEngine } from './MatrixCompletionEngine';
import { MemoryFlashEngine } from './MemoryFlashEngine';
import { OddOneOutEngine } from './OddOneOutEngine';
import { OddWordOutEngine } from './OddWordOutEngine';
import { OrderingEngine } from './OrderingEngine';
import { PairFindEngine } from './PairFindEngine';
import { RapidClassificationEngine } from './RapidClassificationEngine';
import { RotationMatchEngine } from './RotationMatchEngine';
import { SentenceOrderingEngine } from './SentenceOrderingEngine';
import { SequenceRepairEngine } from './SequenceRepairEngine';
import { SequenceCompletionEngine } from './SequenceCompletionEngine';
import { SymbolSweepEngine } from './SymbolSweepEngine';

interface RenderEngineProps {
  puzzle: Puzzle;
  revealed: boolean;
  onAnswer: (answer: Answer) => void;
}

/**
 * Engine id → component. Stands in for `puzzle_engines.ui_component` (§3) until
 * the registry exists; adding an engine means adding a case, nothing more.
 *
 * The switch is exhaustive over `Puzzle`'s `engineId` discriminant, so a new
 * engine fails to compile until it is routed here.
 */
export function renderEngine({ puzzle, revealed, onAnswer }: RenderEngineProps) {
  const props = { revealed, onAnswer };

  switch (puzzle.engineId) {
    case 'OBS_001':
      return <OddOneOutEngine puzzle={puzzle} {...props} />;
    case 'OBS_003':
      return <RotationMatchEngine puzzle={puzzle} {...props} />;
    case 'OBS_004':
      return <PairFindEngine puzzle={puzzle} {...props} />;
    case 'PAT_001':
      return <SequenceCompletionEngine puzzle={puzzle} {...props} />;
    case 'PAT_002':
      return <MatrixCompletionEngine puzzle={puzzle} {...props} />;
    case 'PAT_003':
      return <SequenceRepairEngine puzzle={puzzle} {...props} />;
    case 'LOG_001':
      return <DeductionEngine puzzle={puzzle} {...props} />;
    case 'LOG_002':
      return <BalanceScalesEngine puzzle={puzzle} {...props} />;
    case 'LOG_003':
      return <OrderingEngine puzzle={puzzle} {...props} />;
    case 'LNG_001':
      return <AnalogyEngine puzzle={puzzle} {...props} />;
    case 'LNG_002':
      return <OddWordOutEngine puzzle={puzzle} {...props} />;
    case 'LNG_003':
      return <SentenceOrderingEngine puzzle={puzzle} {...props} />;
    case 'ATT_001':
      return <SymbolSweepEngine puzzle={puzzle} {...props} />;
    case 'ATT_002':
      return <MemoryFlashEngine puzzle={puzzle} {...props} />;
    case 'ATT_003':
      return <RapidClassificationEngine puzzle={puzzle} {...props} />;
  }
}
