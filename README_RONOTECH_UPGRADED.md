# RonoTech School Management System – Upgraded Edition

This edition preserves the existing Mabasi School Management System features and adds a more professional commercial/web-app presentation.

## Included
- Professional public school website/landing page
- Secure staff login
- Existing role-based access: Administrator, Staff, Teacher, Finance Officer, Librarian
- Existing Student Management, Leave/Out, Exam Analyzer, Library, Finance and Reports modules
- Existing SQLite database and LAN support
- Improved sidebar branding and navigation appearance
- Improved logged-in user header and role display
- Administrator-only Reset School Data control
- Responsive layout for desktop, tablet and mobile

## Start on Windows
1. Extract the ZIP to a folder such as `C:\RonoTechSchool`.
2. Run `START SCHOOL SYSTEM.bat`.
3. Open the local address shown by the program, normally `http://localhost:3001`.
4. For other computers on the same Wi-Fi/LAN, use the LAN address shown by the server.

## Default administrator
Username: `admin`
Password: `Admin@1234`

Change the administrator password after the first login.

## Important commercial deployment note
This is a local/LAN edition. For multiple schools, create a separate database and configuration for each customer. Do not reuse one school's live database for another school.

For an online multi-school version, the authentication, database and tenancy model should be upgraded before public deployment.

## Commercial upgrade
This version includes **Administration → School Profile**. The administrator can configure the customer's school identity without editing the HTML source. For multiple customers, deploy each school as a separate installation with its own `data/school-management.db` database.

## Commercial Security Upgrade — September 2026

This release adds:
- Strong per-user password changes from the signed-in account.
- Automatic sign-out of other active sessions after a password change.
- Failed-login throttling: repeated failed attempts from one IP are temporarily blocked.
- Security response headers for the web application.
- Administrator audit log for sign-ins, password changes, user management, school-profile changes, license activation and backups.
- Administrator audit-log viewer inside Administration.
- Existing role-based Finance and Library protection is preserved.
- Existing school-specific licensing, backup and first-run setup are preserved.

### Important commercial deployment note
This remains the Local/LAN edition. Each school should have its own installation and database. Do not place the SQLite database on a shared network drive or expose this Express server directly to the public Internet without a proper hosted architecture, HTTPS, database strategy and hardened authentication layer.
