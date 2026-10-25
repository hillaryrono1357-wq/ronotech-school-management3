# Mabasi School Management System - Updated

## Updates in this version
- Class teacher comments are generated directly by the system from the learner's overall performance band; no manual typing is required for report generation.
- Graphical performance analysis in the Exam Analyzer is now a professional line graph.
- The school server starts in the Windows background using a hidden Node.js process.
- After starting with `START SCHOOL SYSTEM.bat`, the CMD window can be closed without shutting down the server.
- `RUN SCHOOL SYSTEM BACKGROUND.vbs` provides a one-click background starter without keeping a CMD window open.
- `STOP SCHOOL SYSTEM.bat` stops the specific server process started by the system.

## Start
Run `START SCHOOL SYSTEM.bat` or double-click `RUN SCHOOL SYSTEM BACKGROUND.vbs`.

Open:
http://localhost:3001 (the server automatically moves to the next port 3002-3010 if needed)

## Default administrator
Username: `admin`
Password: `Admin@1234`

Change the default password after first login.

FINANCE / LEARNER BALANCE CARRY-FORWARD
- When a learner is moved to another grade, the same learner/admission ID is retained, so academic, attendance, library and financial records stay linked.
- When a new invoice is created, any outstanding balance from previous invoices is automatically carried forward onto the new invoice.
- The old invoice remains available for history, but its transferred balance is closed so the debt is not counted twice.
- Financial reports include carried-forward balances.


PORT / PERMISSION FIX
- The original port 3000 could fail on some Windows computers with EACCES permission denied.
- This version starts on port 3001 and automatically tries ports 3002 through 3010 if a port is unavailable.
- The active port is written to server.port so the start scripts open the correct address automatically.
- The server prints the detected LAN IPv4 address when it starts.
