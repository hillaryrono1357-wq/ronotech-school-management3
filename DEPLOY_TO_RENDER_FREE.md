# RonoTech School Management System — Render Free Test Deployment

This package is prepared for **testing with dummy data only** on Render's free web-service tier.

## Important limitations

- Render Free web services can sleep after inactivity.
- This app uses SQLite in `data/school-management.db`. The free service's local filesystem is ephemeral; SQLite records may be lost after a restart, redeploy, or instance replacement. Do not use this free setup for real learner, exam, finance, or staff records.
- The original local database, backups, local TLS certificate/private key material, `node_modules`, and runtime logs were intentionally excluded from this deployment copy. The deployed app starts with a fresh database.
- The app creates a default administrator when the database is empty: username `admin`, password `Admin@1234`. Change this immediately after logging in. Do not keep this password on any publicly accessible production deployment.
- Render provides HTTPS at the public URL. Local TLS certificates were removed so the app can use Render's HTTP proxy correctly.

## Deploy

1. Extract this ZIP on your computer.
2. Create a private GitHub repository and upload the extracted project files (including `render.yaml`, `package.json`, `package-lock.json`, and `server.js`). Do not upload a local database, real school data, credentials, `.env` files, or TLS private keys.
3. Sign in at https://render.com and connect the GitHub repository.
4. If Render detects `render.yaml`, review the service settings. Otherwise create a **Web Service** with:
   - Runtime: Node
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check path: `/api/bootstrap`
   - Instance plan: Free
5. Deploy and wait for the build to finish.
6. Open the Render-provided `https://...onrender.com` URL.
7. Log in with the initial test credentials above, then change the password. Use only dummy records while testing.
8. Test student entry, marks entry, score sheets, report cards, downloads, and backup/restore. After a restart/redeploy, check whether the test data remains; on Free it is not guaranteed to persist.

## For real school use later

Move SQLite to a persistent disk on a paid service, or migrate the data layer to a managed database with persistent storage. Configure backups, access controls, and secrets before entering real school data.
