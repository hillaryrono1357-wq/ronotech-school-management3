# Report Card Batch Download Fix v1.4.0

Fixed the Professional A4 Report Card export failure caused by the exporter calling a missing `eaClassTeacherComment()` function.

Added:
- Download Selected Class / Stream
- Whole Selected Class (all streams)
- Selected Stream (requires class + stream)
- A4 report cards remain in one PDF, one learner per page
- Existing examination comparison line graph retained
- Safe handling of exams without stored teacher remarks
- jsPDF direct browser download retained
