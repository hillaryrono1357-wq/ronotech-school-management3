# RonoTech Commercial Product v1.3.0

## Commercial Control Center
Added a separate **RonoTech Commercial Control Center** for the RonoTech owner/operator.

### Customer management
- Maintain one commercial record for each school/site.
- Store school/site ID, school name, contact person, phone, email and location.
- Record installation date, plan, license number, issue date and expiry date.
- Track support start/end dates and commercial notes.

### License and renewal management
- Dashboard counts total schools, active licenses, licenses expiring within 30 days, expired licenses and active support records.
- Automatic license status: Active, Expiring Soon, Expired or No expiry.
- Renewal workflow records new expiry date, plan, license number, support end date, amount, payment reference and notes.
- Renewal history is retained per customer.

### Security and operations
- Owner-only sign-in for the Control Center.
- Owner password change with session invalidation.
- Owner audit log.
- Local Control Center database backup.
- JSON export of commercial records.
- Control Center binds to localhost by default and is separate from each school's LAN application.

### Important security boundary
The Control Center does **not** contain the license-signing private key. Customer installations continue to contain only the public verification key. License signing/issuance remains a separate owner-side process.

## Existing school-system features retained
The v1.2.0 school application remains the customer-facing Local/LAN system with:
- role-based login
- Finance and Library protection
- school profile and branding
- signed license activation and expiry/grace enforcement
- audit logging
- automatic/manual backups
- existing student, examination, finance, library and report modules

## Deployment
For RonoTech's internal use, run `RonoTech_Control_Center/START RONOTECH CONTROL CENTER.bat`.

For a customer deployment, distribute the school-management application only; do not distribute the Control Center folder or its commercial database.

## License Generation Update
- Added **Generate License** to Schools & Customers.
- Generates an Ed25519-signed activation key using the same verification format used by the school application.
- Automatically assigns a license number when one is not supplied.
- Saves the issued license number, issue date, expiry, plan and support end date to the customer record.
- Downloads a `.ronolicense` file containing the activation key and customer/license details.
- The signing private key is stored only under the owner-side Control Center and must never be distributed with a customer school installation.
