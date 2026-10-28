# Ebadsave VSLA — Cloudflare migration patch (Phase 1)

This patch contains only the app files that need replacing for the first migration step.

## Included replacement files
- `src/screens/HomeScreen.tsx` — replaces the Google Drive home button with a Cloudflare Backup button.
- `src/screens/BackupRestoreScreen.tsx` — removes Google OAuth and Google Drive UI, and clearly indicates Cloudflare is not active until the backend is configured.
- `package.json` — removes `expo-auth-session` and `expo-web-browser`, which were used only by the Google Drive implementation in this project.

## Delete these obsolete Google Drive files from your project
- `src/config/googleDrive.ts`
- `src/services/googleDriveBackup.ts`
- `src/services/googleDrivePilotBackup.ts`

These files are intentionally listed for deletion rather than included as empty replacements.

## Important
This is only the first cleanup phase. It does **not** yet enable Cloudflare backups. Cloudflare must be configured with a Worker API, R2 bucket, D1 database, authentication/authorization, encryption and recovery endpoints before the new backup button can perform cloud operations. Existing Back4App code and backups are intentionally retained until Cloudflare has passed end-to-end backup and restore tests.

After copying the replacement files and deleting the three obsolete Google Drive files, run `npm install`, then check `git diff` and build the app. Do not remove Back4App configuration or existing backup code in this phase.
