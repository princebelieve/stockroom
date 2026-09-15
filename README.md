# Stockroom Business App

## Desktop application

The Windows desktop version starts its own private local server and SQLite database. Your clients open the installed application; they do not open a terminal or run `npm`.

For development, run:

```powershell
npm run desktop
```

To create a 64-bit Windows installer, run:

```powershell
npm run desktop:package
```

When packaging succeeds, give clients the `Setup.exe` file in the `release` folder. Their business data is stored separately at `%APPDATA%\Stockroom Business\data`, so it survives application upgrades and uninstall/reinstall choices that preserve user data. Back up `stockroom.sqlite` from that directory regularly.

## Mobile installation

The browser app is a PWA: users can install it from Chrome/Edge on Android or **Share → Add to Home Screen** in Safari on iPhone. It must be served from an HTTPS address (not `localhost`) for service-worker installation to work on a phone.

This PWA caches the interface and local product/sale queue. It is not yet a complete native mobile app because phones cannot run this Node/SQLite server. A full Android/iOS release needs the next phase: a hosted, authenticated sync API and a Capacitor app with native SQLite.

## MongoDB sync (next phase)

MongoDB must be connected only by a hosted sync API. Do not put a MongoDB URI or database password in the desktop/mobile application or its settings page. The sync API needs server-owned credentials, user authentication, operation IDs for idempotency, conflict rules, and backups.

## Before distribution

- Test installation, offline use, restart, and an application update on a clean Windows computer.
- Set your real application name, publisher/author, version, privacy policy, and support contact in `package.json`.
- Obtain a Windows code-signing certificate. Unsigned installers show Windows SmartScreen warnings.
- For Android/iPhone store releases, create Google Play / Apple Developer accounts and complete the Capacitor/native build phase.
