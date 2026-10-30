# CineSaga AI Mobile — experimental PWA

Static, local-first story and scene preparation. Use ChatGPT separately and manually copy/paste text through Story Workshop. Real AI providers are NOT_CONFIGURED; no paid generation is enabled.

Only public application code and branding icons belong in this repository. Never commit stories, backups, reference images, recordings, credentials, databases or server configuration. Project data is saved in the browser's IndexedDB, not this repository or GitHub Pages. Export backups privately; backups are not encrypted.

The Pages workflow verifies the exact hashes in `site-sha256.txt` and publishes only `site/`. Review every replacement release and update its hashes deliberately. No server or secrets are required. The initial page visit requires internet access; offline operation starts after the Service Worker finishes caching. Browser/OS storage may be cleared; installation is not a backup.

Android Chrome installation, device clipboard/pickers, codecs and MP4 export performance require real-phone testing. Desktop browser tests do not certify Android support. MP4 export remains unavailable when required native codecs are missing. Temporary media selections are not retained across reload; download the reviewed result before leaving.

This is a public static application, not a private cloud service or authenticated online story store. Pages on the same `github.io` owner domain share a browser origin; separate repository paths are not a security boundary between applications. Keep the device locked and review hosting/update integrity before importing private material.
