/**
 * Expo config. Replaces app.json so the background colour can be read from the
 * theme instead of being written down a second time.
 *
 * `src/theme/palette.json` is the single source of truth for the app
 * background. It is JSON rather than TypeScript because Expo evaluates this
 * file in plain Node — importing a .ts module here would require adding `tsx`
 * as a dependency just to read one hex value.
 *
 * The same token feeds four surfaces, which is what removes the launch flash:
 *   1. the native splash screen        (expo-splash-screen plugin)
 *   2. the native root view            (top-level backgroundColor)
 *   3. the web page background         (web.backgroundColor)
 *   4. the first React render          (colors.background, via App.tsx)
 */

const { background } = require('./src/theme/palette.json');

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  // The USER-FACING app name: the Android launcher label and the Play listing title.
  // It was 'brainbrew-app' — the slug — so the phone's home screen literally read
  // "brainbrew-app". The slug/EAS project id stay as they are; only the display
  // name changes.
  name: 'BrainBrew',
  slug: 'brainbrew-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  // Deep-link schemes: `brainbrew` for the email-upgrade / sign-in callback
  // (`brainbrew://auth-callback`, docs/EMAIL_ACCOUNT_UPGRADE.md) and the
  // RevenueCat-generated `rc-2f2d62d750` for the purchase return flow. Both are
  // required on native; the Auth scheme must never be replaced. Web uses origin.
  scheme: ['brainbrew', 'rc-2f2d62d750'],
  // Root view behind the React tree. Needs expo-system-ui on iOS.
  backgroundColor: background,
  ios: {
    supportsTablet: true,
    // Bundle identifier required for a native dev build + RevenueCat/StoreKit
    // (Phase 7E). Testing identifier — Founder confirms before any store launch.
    bundleIdentifier: 'com.brainbrew.app',
  },
  android: {
    // Package name required for a native dev build + Google Play Billing /
    // RevenueCat (Phase 7E). Testing identifier — Founder confirms before launch.
    package: 'com.brainbrew.app',
    // Bumped manually per release (eas.json uses appVersionSource: "local").
    versionCode: 2,
    adaptiveIcon: {
      // Launcher-icon background, not the splash. Left as-is deliberately —
      // it is an icon-design decision, not part of the launch flash.
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    // Painted before the stylesheet and JS bundle land.
    backgroundColor: background,
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: background,
        // The app is dark-only, so the dark variant is the same surface.
        dark: { backgroundColor: background },
      },
    ],
    // Native share sheet for exporting the daily/practice Share Card (Phase 7A).
    // Inert on web, where the flow uses the Web Share API / download fallback.
    'expo-sharing',
  ],
  // EAS project (Phase 7J). The RevenueCat PUBLIC Android SDK key is supplied as
  // an EAS environment variable at build time — never committed here.
  owner: 'roomly',
  extra: {
    eas: { projectId: '26ed6517-d357-4627-b782-7a3e41f2e3ed' },
  },
};
