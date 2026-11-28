# RAFIQ PWA release and installation guide

Official production origin: https://rafiq-lebanon.pages.dev/

## Supported installation paths

- Android (Chrome / Edge): open the official HTTPS origin, use the browser's Install app prompt or the RAFIQ install button, then confirm installation.
- iPhone / iPad (Safari): open the official HTTPS origin, tap Share, choose Add to Home Screen, then Add. iOS does not expose the Chromium `beforeinstallprompt` flow.
- Windows / macOS / Linux (supported Chromium browsers): open the official HTTPS origin and use the browser Install control when offered. Availability depends on browser and operating-system support.
- Other browsers: use Add to Home Screen / Install from the browser menu when available. If no install action is offered, keep RAFIQ as a browser bookmark.

## Release checks

- Both manifest files must remain valid JSON and aligned on start URL, scope, display mode, icons and shortcuts.
- The home page must reference the official canonical origin and the current installer script versions.
- The service worker cache name and registration URL must be bumped together when shipped assets change.
- The static build must replace legacy Render URLs in generated assets and fail if any remain.
- The production deployment must complete successfully before announcing the release.

## Important limitations

RAFIQ is delivered as an installable Progressive Web App (PWA), not as a separately signed native Android APK or an App Store / Google Play listing. Installation is performed from the official website using browser capabilities. Push notifications, background execution and some device integrations vary by browser and operating system.

No installation can be forced remotely on users' devices. Each user must approve installation on their own device.
