# App update notices

Windows and Android builds check `https://stockroom.globalcreest.com/app-update.json` when online, when the app is opened, and when it returns to the foreground. A newer version opens a prompt with a link to the landing page's Downloads section. Dismissing it postpones the same notice for 24 hours. The notice does not install the update automatically.

After preparing each release, update the platform version in `public/app-update.json` to match the Windows `package.json` version or Android `versionName`, then deploy the website to Vercel. Keep the app ID and Android signing keystore unchanged so users can upgrade their existing installations.

The PWA updates itself through its service worker. Builds made before this prompt was added cannot display it; announce this first update to existing Windows and Android users directly and ask them to install it once. Later builds can notify users running this release or newer.
