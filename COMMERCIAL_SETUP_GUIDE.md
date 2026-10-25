# RonoTech School Management — Commercial Setup Guide

## 1. Install for a new school
1. Copy the complete system folder to the school's server/administrator computer.
2. Run `npm install` if dependencies are not already installed.
3. Start the system with `START SCHOOL SYSTEM.bat` on Windows.
4. Open the displayed localhost/LAN address.
5. Sign in with the initial administrator account.
6. Immediately change the administrator password.
7. Open **Administration → School Profile** and enter the customer's school details.
8. Create separate accounts for teachers, finance officers, librarians and staff.

## 2. Recommended commercial package
- Installation and configuration
- School branding
- User account setup
- Initial training
- Database backup setup
- Technical support
- Agreed future updates

## 3. Data separation
For each customer, use a separate installation/data directory and a separate SQLite database. Never combine two schools' student, finance, examination or library records in one database.

## 4. Local network deployment
Run the system on one designated server computer and allow authorized school computers to access it over the school's LAN. Keep the server computer backed up and protected with a strong Windows account/password.

## 5. Before handing over a system
- Confirm the school name and logo.
- Test administrator login.
- Test each staff role.
- Test student registration.
- Test examination entry/analysis.
- Test finance and receipts.
- Test library.
- Test reports and PDF printing.
- Create and verify a database backup.
- Remove all demo/test learner data unless the customer explicitly requests it.
