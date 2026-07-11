/**
 * Share-image capture + share — NATIVE implementation (iOS/Android).
 *
 * Captures the ShareCard view with `react-native-view-shot` to a temporary PNG
 * (cache directory, OS-managed — we persist nothing), then presents the native
 * share sheet with `expo-sharing`. No image is uploaded anywhere. This module is
 * NOT bundled on web — `shareImage.web.ts` is resolved there instead — so the web
 * bundle never pulls in the native modules.
 */

import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

export interface ShareResult {
  outcome: 'shared' | 'cancelled' | 'downloaded' | 'unsupported' | 'failed';
}

export async function captureCard(ref: RefObject<View | null>, _size: number): Promise<string> {
  // Render to a stable 1080² PNG regardless of the on-screen size/viewport.
  return captureRef(ref, { format: 'png', quality: 1, width: 1080, height: 1080, result: 'tmpfile' });
}

export async function shareCardImage(uri: string, _text: string, _filename: string): Promise<ShareResult> {
  if (!(await Sharing.isAvailableAsync())) return { outcome: 'unsupported' };
  try {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your BrewScore', UTI: 'public.png' });
    return { outcome: 'shared' };
  } catch {
    // The native sheet does not reliably distinguish cancel from failure.
    return { outcome: 'failed' };
  }
}
