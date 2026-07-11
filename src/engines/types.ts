import type { Answer, Puzzle } from '../types/puzzle';

/**
 * Every engine has the same contract: render a puzzle, report exactly one
 * Answer, and never score anything itself (scoring lives in scoring/brewScore).
 *
 * `revealed` is owned by the session host. Once true the engine is frozen and
 * shows its outcome; it must not emit a second answer.
 */
export interface EngineProps<P extends Puzzle> {
  puzzle: P;
  revealed: boolean;
  onAnswer: (answer: Answer) => void;
}
