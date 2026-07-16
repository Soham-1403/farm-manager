# Deploy Farm Manager for mobile use

Farm Manager is an offline-first PWA with Firebase Authentication and Cloud Firestore synchronization.

## Recommended: Firebase Hosting and Firestore

The repository is connected to Firebase project `farm-management-1` through `.firebaserc`.

Current production URL: **https://farm-management-1.web.app**

1. In Firebase Authentication, enable Email/Password and create the farm user.
2. Create the default Firestore database in production mode, preferably in `asia-south1` (Mumbai).
3. Run `npm.cmd install`, `npm.cmd test`, and `npm.cmd run build`.
4. Authenticate the Firebase CLI with `npx.cmd firebase-tools login`.
5. Deploy the database rules and PWA with `npx.cmd firebase-tools deploy --only firestore:rules,hosting`.
6. Open the resulting `web.app` URL and sign into synchronization from Settings.

The rules restrict each user's records to that Firebase Authentication UID and prohibit hard deletion. No Cloud Functions or Blaze billing plan is required.

## Recommended: GitHub Pages

1. Create an empty GitHub repository, for example `farm-manager`.
2. Upload or push this project to its `main` branch.
3. In **Repository Settings → Pages**, select **GitHub Actions** as the source.
4. Open the **Actions** tab and run **Deploy Farm Manager to GitHub Pages** if it did not start automatically.
5. Open the resulting HTTPS Pages URL on the phone.

The included workflow runs all tests, creates the production build, and publishes `dist/`. Relative PWA paths allow installation from a project URL such as `https://username.github.io/farm-manager/`.

## Install on a phone

- Android/Chrome: open the HTTPS URL, open the browser menu, then choose **Install app** or **Add to Home screen**.
- iPhone/Safari: open the HTTPS URL, tap **Share**, then choose **Add to Home Screen**.

Open the installed app once while online so its offline files are cached. Farm records are stored locally in that browser installation. Use **Settings → Backup now** regularly.

## Updating the app

Push changes to `main`. GitHub Pages redeploys automatically. Reopen the app while online to receive the new application files; local farm records remain in IndexedDB.

## Automatic synchronization

Sign into the same Firebase account on each installation. Saves remain local and immediate, then synchronize automatically after edits, at startup, when the network returns, every five minutes while open, and through Firestore's real-time listener. Mobile operating systems can suspend a fully closed PWA, so any pending synchronization resumes the next time it opens.
