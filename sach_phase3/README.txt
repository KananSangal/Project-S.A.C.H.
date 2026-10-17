SACH Phase 3A — Centre Directory and History APIs

This is an append-only extension for the current Phase 2 backend. It does not replace main.py and does not change the existing endpoints.

1. Make a backup:
   cp app/main.py app/main.py.phase2-backup

2. Open app/main.py and paste the contents of phase3_routes.py at the VERY END of the file.
   The block expects the existing Phase 2 imports/models/helpers in main.py, including BaseModel,
   Optional, Field (imported in the block), HTTPException (imported in the block), select,
   Session, Depends, get_db, CentreRecord, AttendanceRecord, AuditRecord, centre_to_dict,
   calculate_centre_risk, and refresh_cache.

3. Save. Uvicorn --reload should restart. If it does not, stop and restart:
   python3 -m uvicorn app.main:app --reload

4. Open http://127.0.0.1:8000/docs and test:
   GET  /api/centres
   GET  /api/centres/DELHI_001
   GET  /api/centres/DELHI_001/attendance
   GET  /api/centres/DELHI_001/audits

5. To create a centre, use POST /api/centres?centre_id=JAIPUR_004 with JSON:
   {
     "name": "PMKVY Training Centre - Jaipur",
     "registered_total": 20,
     "official_marked_present": 18,
     "live_headcount": 17,
     "detected_computers": 18,
     "required_computers": 20,
     "compliance_percentage": 90
   }

6. To partially update, use PUT /api/centres/JAIPUR_004 with only fields to change, e.g.:
   {"official_marked_present": 19, "live_headcount": 16}

Notes:
- Existing GET /, POST /api/attendance/log, POST /api/audit/submit, and GET /api/dashboard/stats are left intact.
- The original calculate_centre_risk() is called unchanged for create/update.
- No centre DELETE endpoint is added in this step, to avoid accidental loss of operational records.
- This is an additive implementation; it does not alter either YOLO pipeline.
