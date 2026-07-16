# Deploy Farm Manager for mobile use

Farm Manager is a static, offline-first PWA. The frontend needs an HTTPS static host; no application server is required unless optional multi-device synchronization is enabled.

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

## Optional synchronization

The static site does not automatically synchronize data between phones or browsers. To enable that, separately deploy `sync_server/` behind HTTPS, set `SYNC_ALLOWED_ORIGIN` to the exact Pages URL, use a long unique `SYNC_TOKEN`, and configure the URL and token under **Settings → Optional device synchronization**.
