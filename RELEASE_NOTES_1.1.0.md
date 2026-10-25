# RonoTech School Management System v1.1.0

## Security & Commercial Upgrade

- Per-user password change from the signed-in header.
- Changing a password signs out the user's other active sessions.
- Failed-login throttling after repeated incorrect attempts.
- Security response headers.
- Administrator security audit log.
- Audit records for login, logout, password changes, user management, school profile changes, license activation and backups.
- Existing license activation, role-based access, automatic backups, school branding and LAN operation retained.

## Installation

1. Install Node.js LTS on the Windows server computer.
2. Extract this ZIP to a normal folder.
3. Open Command Prompt in that folder.
4. Run `npm install`.
5. Double-click `START SCHOOL SYSTEM.bat`.
6. Complete the first-run school/license setup.

Do not copy the `data` folder from another school's installation. Each school should have its own database and license.
