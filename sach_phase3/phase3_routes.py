# SACH Phase 3A — append this block to the END of backend/app/main.py
# It reuses the existing SQLAlchemy models, session dependency, and risk function.
# Existing endpoint contracts are not modified.

from fastapi import HTTPException
from pydantic import Field


class CentreCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    registered_total: int = Field(default=15, ge=0)
    official_marked_present: int = Field(default=0, ge=0)
    live_headcount: int = Field(default=0, ge=0)
    detected_computers: int = Field(default=0, ge=0)
    required_computers: int = Field(default=0, ge=0)
    compliance_percentage: float = Field(default=100.0, ge=0, le=100)


class CentreUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    registered_total: Optional[int] = Field(default=None, ge=0)
    official_marked_present: Optional[int] = Field(default=None, ge=0)
    live_headcount: Optional[int] = Field(default=None, ge=0)
    detected_computers: Optional[int] = Field(default=None, ge=0)
    required_computers: Optional[int] = Field(default=None, ge=0)
    compliance_percentage: Optional[float] = Field(default=None, ge=0, le=100)


def _centre_detail(record: CentreRecord) -> dict:
    """Stable centre representation for directory/detail endpoints."""
    return {"centre_id": record.centre_id, **centre_to_dict(record)}


@app.get("/api/centres")
def list_centres(db: Session = Depends(get_db)):
    """Return all persisted training centres, sorted by centre ID."""
    rows = db.scalars(select(CentreRecord).order_by(CentreRecord.centre_id)).all()
    return {"total": len(rows), "centres": [_centre_detail(row) for row in rows]}


@app.post("/api/centres", status_code=201)
def create_centre(centre_id: str, data: CentreCreate, db: Session = Depends(get_db)):
    """Create a centre. Pass centre_id as a query parameter, e.g. ?centre_id=JAIPUR_004."""
    centre_id = centre_id.strip().upper()
    if not centre_id or len(centre_id) > 100:
        raise HTTPException(status_code=422, detail="centre_id must be 1–100 characters")
    if db.get(CentreRecord, centre_id) is not None:
        raise HTTPException(status_code=409, detail=f"Centre '{centre_id}' already exists")

    centre = {
        "name": data.name,
        "registered_total": data.registered_total,
        "official_marked_present": data.official_marked_present,
        "live_headcount": data.live_headcount,
        "detected_computers": data.detected_computers,
        "required_computers": data.required_computers,
        "compliance_percentage": data.compliance_percentage,
        "fraud_risk_score": 0.0,
        "status": "SAFE",
    }
    calculate_centre_risk(centre)
    record = CentreRecord(centre_id=centre_id, **centre)
    db.add(record)
    db.commit()
    db.refresh(record)
    refresh_cache(db)
    return {"status": "SUCCESS", "centre": _centre_detail(record)}


@app.get("/api/centres/{centre_id}")
def get_centre(centre_id: str, db: Session = Depends(get_db)):
    record = db.get(CentreRecord, centre_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Centre not found")
    return _centre_detail(record)


@app.put("/api/centres/{centre_id}")
def update_centre(centre_id: str, data: CentreUpdate, db: Session = Depends(get_db)):
    """Partially update centre fields; omitted fields remain unchanged."""
    record = db.get(CentreRecord, centre_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Centre not found")

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "SUCCESS", "centre": _centre_detail(record)}

    # Merge existing values and supplied fields, then use the original risk function.
    centre = centre_to_dict(record)
    centre.update(updates)
    calculate_centre_risk(centre)
    for key, value in centre.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)
    refresh_cache(db)
    return {"status": "SUCCESS", "centre": _centre_detail(record)}


@app.get("/api/centres/{centre_id}/attendance")
def get_centre_attendance_history(
    centre_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    if db.get(CentreRecord, centre_id) is None:
        raise HTTPException(status_code=404, detail="Centre not found")
    limit = max(1, min(limit, 200))
    rows = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.centre_id == centre_id)
        .order_by(AttendanceRecord.id.desc())
        .limit(limit)
    ).all()
    items = [
        {"id": row.id, "centre_id": row.centre_id,
         "live_headcount": row.live_headcount, "timestamp": row.timestamp}
        for row in rows
    ]
    return {"centre_id": centre_id, "total_returned": len(items), "logs": items}


@app.get("/api/centres/{centre_id}/audits")
def get_centre_audit_history(
    centre_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    if db.get(CentreRecord, centre_id) is None:
        raise HTTPException(status_code=404, detail="Centre not found")
    limit = max(1, min(limit, 200))
    rows = db.scalars(
        select(AuditRecord)
        .where(AuditRecord.centre_id == centre_id)
        .order_by(AuditRecord.id.desc())
        .limit(limit)
    ).all()
    items = [
        {"id": row.id, "centre_id": row.centre_id,
         "detected_computers": row.detected_computers,
         "required_computers": row.required_computers,
         "compliance_percentage": row.compliance_percentage,
         "status": row.status, "timestamp": row.timestamp}
        for row in rows
    ]
    return {"centre_id": centre_id, "total_returned": len(items), "logs": items}
