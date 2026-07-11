/**
 * The one place a GameplayService is constructed. Picks local or cloud from the
 * resolved content mode so no screen ever reads the environment or branches on
 * mode itself.
 */

import { activeMode } from '../cloud/env';
import { CloudGameplayService } from '../cloud/cloudGameplayService';
import type { GameplayService } from './gameplayService';
import { LocalGameplayService } from './localGameplayService';

export function createGameplayService(opts?: {
  today?: Date;
  devOverrideIndex?: number | null;
}): GameplayService {
  if (activeMode() === 'cloud') return new CloudGameplayService();
  return new LocalGameplayService(opts?.today, opts?.devOverrideIndex ?? null);
}
