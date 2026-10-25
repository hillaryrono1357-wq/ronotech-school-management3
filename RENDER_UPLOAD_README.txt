RONOTECH SCHOOL MANAGEMENT — RENDER TEST UPLOAD

This package has the application files at the ZIP root so they can be uploaded
to the ROOT of the connected GitHub repository.

IMPORTANT:
- This package is for TESTING WITH DUMMY DATA ONLY on Render Free.
- Render Free local storage is ephemeral; SQLite records can be lost after
  restarts/redeploys. Do not enter real learner, staff, marks, or finance data.
- The original local database and the RonoTech Control Center (which contains
  local commercial database/key material) have intentionally been excluded.
- Do not upload private keys, local database files, .env files, or real school data.

DEPLOY:
1. Extract this ZIP.
2. Upload the CONTENTS of the extracted folder to the ROOT of the connected
   GitHub repository (not as a nested folder). Include package.json,
   package-lock.json, server.js, render.yaml, and the application's JS/HTML files.
3. Commit the files to the main branch.
4. In Render, open the existing web service and choose Manual Deploy >
   Deploy latest commit.
5. Wait for the build and check the service logs if it fails.
6. The test app creates a default login: admin / Admin@1234.
   Change the password immediately and use dummy data only.

For permanent school use, configure persistent storage or migrate to a
managed persistent database before entering real school records.
