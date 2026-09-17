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

## iPhone PWA

The separate PWA build runs in the browser with a persistent local database and cloud synchronization. See [PWA deployment instructions](PWA-DEPLOYMENT.md) for Vercel, Render configuration, installation, supported features, and testing. Windows and Android retain their existing native storage paths.

## Android debug APK

Capacitor and the Android project are included. The desktop application is unchanged; Android will use its own device-local SQLite database and synchronize through the existing Render sync API.

Install Android SDK Platform 36 and Build-Tools 36 from Android Studio or the Android command-line tools, then set `android/local.properties` (this file is deliberately ignored by Git):

```properties
sdk.dir=C:\\Users\\YOUR-WINDOWS-USER\\AppData\\Local\\Android\\Sdk
```

Build an installable debug APK with:

```powershell
npm run android:debug
```

The APK is copied to `release\android\Stockroom-debug.apk`. Transfer that file to the phone and approve installation from the file manager. Debug APKs are for testing and are not suitable for Play Store distribution.

## MongoDB sync (next phase)

MongoDB must be connected only by a hosted sync API. Do not put a MongoDB URI or database password in the desktop/mobile application or its settings page. The sync API needs server-owned credentials, user authentication, operation IDs for idempotency, conflict rules, and backups.

## Before distribution

- Test installation, offline use, restart, and an application update on a clean Windows computer.
- Set your real application name, publisher/author, version, privacy policy, and support contact in `package.json`.
- Obtain a Windows code-signing certificate. Unsigned installers show Windows SmartScreen warnings.
- For Android/iPhone store releases, create Google Play / Apple Developer accounts and complete the Capacitor/native build phase.
