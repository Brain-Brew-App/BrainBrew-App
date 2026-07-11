/**
 * Share-image capture + share — WEB implementation (Metro resolves this on web).
 *
 * Captures the ShareCard's DOM node with `html-to-image` (reliable in the browser,
 * no native module), then shares via the Web Share API when file sharing is
 * supported, else downloads the PNG. No image is uploaded anywhere.
 */

import { toPng } from 'html-to-image';
import type { RefObject } from 'react';
import type { View } from 'react-native';

export interface ShareResult {
  outcome: 'shared' | 'cancelled' | 'downloaded' | 'unsupported' | 'failed';
}

const NAVY = '#0A1020';

export async function captureCard(ref: RefObject<View | null>, size: number): Promise<string> {
  const node = ref.current as unknown as HTMLElement | null;
  if (!node) throw new Error('no_node');
  const pixelRatio = Math.max(1, Math.min(3, Math.round(1080 / size)));
  return toPng(node, { pixelRatio, cacheBust: true, backgroundColor: NAVY });
}

export async function shareCardImage(dataUrl: string, text: string, filename: string): Promise<ShareResult> {
  try {
    const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
    const FileCtor = (globalThis as unknown as { File?: typeof File }).File;
    if (FileCtor && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new FileCtor([blob], filename, { type: 'image/png' });
      if (nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], text } as ShareData);
          return { outcome: 'shared' };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return { outcome: 'cancelled' };
          // fall through to download
        }
      }
    }
    // Fallback: save the image with clear intent (never claim native sharing).
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { outcome: 'downloaded' };
  } catch {
    return { outcome: 'failed' };
  }
}
