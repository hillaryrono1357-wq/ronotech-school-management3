# RonoTech School Management v1.2.0

## Commercial licensing upgrade
- Added a dedicated offline owner license issuer in the separate RonoTech License Manager package.
- Customer installations contain only the Ed25519 public key; the signing private key is not included.
- License payload now supports license number, unique school/site ID, school name, plan, issue date and expiry date.
- Renewal/activation is now locked to the installed school's original `schoolId` and `schoolName`.
- Existing license expiry enforcement remains in place, including the configured 7-day grace period.
- Administrator license status and renewal controls remain available inside the system.

## Security
- The signing private key must remain with RonoTech and must never be distributed with customer installations.
