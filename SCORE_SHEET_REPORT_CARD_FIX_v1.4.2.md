# RonoTech School Management v1.4.2 – Score Sheet & Report Card Fix

## Score Sheet
- The PDF class score sheet is generated from the enrolled learner list for the selected class/stream.
- Every learner is displayed, including learners with no marks entered.
- Unentered marks remain blank rather than excluding the learner.
- Learners with no marks remain unranked; learners with marks retain the existing ranking logic.
- Rows are ordered by admission number.
- The PDF uses a bordered table to clearly separate rows and columns.

## Report Card Comparison
- Each report card compares only the current exam with the immediately previous saved exam.
- Every subject shows: Last Exam, Current Exam, Change vs Last, Current %, CBC level and teacher.
- Subject change is explicitly labelled Increase, Decrease or No change and is shown in percentage points.
- Overall performance shows Current average, Last average and Overall change vs last exam.
- No older exams are included in the learner comparison.
