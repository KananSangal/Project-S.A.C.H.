# SACH — Complete System Architecture
## Smart Attendance & Compliance Hub
### Team: Heisen-de-Bug
### SIH Problem Statement 245 — AI-Based Real-Time Monitoring of Training Centres for Attendance and Infrastructure Compliance

---

## 1. Document Purpose

This document defines the proposed implementation architecture for **SACH (Smart Attendance & Compliance Hub)**.

It is intended to be the working blueprint for:

- Frontend development
- Backend development
- Database design
- AI/ML integration
- API development
- Role-based access
- Dashboard/page planning
- Real-time monitoring
- Fraud/anomaly detection
- Audit workflow
- SIH prototype/demo planning

> **Architecture status:** The original problem statement defines the core modules and technology direction. Exact pages, database tables, API routes, scoring weights, and UI components below are proposed implementation architecture for the prototype.

---

# 2. Project Identity

## 2.1 Project Name

# SACH

**Smart Attendance & Compliance Hub**

## 2.2 Team

**Heisen-de-Bug**

## 2.3 Problem Statement

**AI-Based Real-Time Monitoring of Training Centres for Attendance and Infrastructure Compliance**

## 2.4 One-Line Description

> **SACH is an AI-powered digital monitoring system that verifies whether training centres are actually maintaining attendance, infrastructure and compliance as claimed in their records.**

## 2.5 Simple Explanation

Imagine the government gives a training centre money to train 30 students.

The centre may claim:

- 30 students attended
- all required equipment is available
- students remained present during the session
- everything is compliant

But in reality:

- only 18 students may be present
- some students may leave midway
- someone may mark attendance for another person
- required computers or safety equipment may be missing
- records may not match the actual situation

**SACH acts like a digital AI inspector.**

It uses cameras, mobile scans and other available data to check the actual situation and compare it with what the centre claims.

If something looks suspicious, SACH raises an alert for a human officer to investigate.

---

# 3. Core Philosophy

The system follows:

```text
COLLECT
   ↓
DETECT
   ↓
VERIFY
   ↓
CORRELATE
   ↓
SCORE
   ↓
EXPLAIN
   ↓
ALERT
   ↓
AUDIT
   ↓
RESOLVE
```

The important principle is:

> **SACH identifies suspicious patterns and provides evidence. It does not automatically declare a centre guilty of fraud. Final decisions remain with authorized human officials.**

---

# 4. Core Modules

SACH consists of four major intelligence modules.

## 4.1 Continuous Passive Attendance Engine

Purpose:

- Detect people from CCTV/webcam
- Count students
- Recognize registered students
- Compare detected people with roster
- Detect missing students
- Detect unknown faces
- Detect mid-session dropouts
- Generate attendance events

Technology direction:

- OpenCV
- YOLOv8/YOLO11
- InsightFace / DeepFace
- FastAPI

Workflow:

```text
CCTV / Webcam
      ↓
Person Detection
      ↓
Face Detection
      ↓
Face Recognition
      ↓
Roster Matching
      ↓
Attendance State
      ↓
Attendance Event
      ↓
Analytics / Risk Engine
```

### Attendance Dwell-Time Buffer

- The camera ingestion path posts instantaneous headcounts every 2 seconds.
- Attendance risk uses the median of up to the latest 300 samples in the preceding 10 minutes.
- Attendance discrepancy is measured against learners officially marked present, never total registered enrolment: `gap = max(0, marked_present - AI_detected)`, `coverage = AI_detected / marked_present * 100`, and `attendance_risk = gap / marked_present * 100` when marked present is greater than zero. Learners marked absent are excluded.
- A short headcount dip lasting less than 5 minutes is buffered and does not raise a high-risk attendance flag.
- A discrepancy alert is eligible only after a below-marked-present count continues for more than 10 consecutive minutes. A telemetry gap longer than 6 seconds breaks continuity rather than counting as continued absence.
- When no qualifying sustained gap is active, attendance risk is neutral; the raw observed count and rolling median remain available as separate telemetry.
- Risk scores are investigation signals. Authorized officials retain final decision authority.

### Course Register and Operator Portal

- Centre Operators use individually provisioned accounts assigned to one centre; there is no shared centre password. The API returns the `CENTRE_OPERATOR` role and enforces centre scope server-side.
- A course batch is unique by `(centre_id, course_code)`. An active student roster provides the course enrollment snapshot used as the day's expected count.
- One daily register is allowed per `(course_id, attendance_date)`. The initial submission opens a 30-minute correction period; the operator may make one edit in that period. That edit, or expiry of the 30-minute period, permanently locks the register.
- A locked register can be changed only after an Inspector/Admin approves a pending override request. Approval grants one correction; the correction consumes the grant and locks the register again. Submission, edits, requests, and decisions are retained in history with timestamps, actor, source IP, and a network signature derived from the source IP and User-Agent. This signature is an audit correlation value, not proof of physical location.
- Student roster records retain an opaque face-profile ID and onboarding status only. Raw face images and biometric templates are not stored by these endpoints. A production CCTV matching service should match detections against enrolled profiles before counting them as course attendance; this integration is not yet connected.
- The current camera ingestion records centre-wide headcounts, not course-tagged detections. Operator and Inspector views therefore show course-level camera verification as unavailable rather than presenting a centre total as a course count.

### Role Preview and Enforcement

The web client provides National Admin, Inspector, and Centre Operator preview modes. Previewing a role narrows the visible interface but does not grant permissions. Authenticated backend role checks remain authoritative for every API operation. Operator register, roster, and history endpoints are centre-scoped; national analytics, other-centre data, and the alerts inbox are denied to operators. Inspector/Admin views include register submission timestamps, course-level official counts, and pending override requests. Infrastructure scan records can be archived and restored by an administrator; archiving hides a record from the active list but preserves its evidence and audit history.

---

## 4.2 AI Infrastructure & Equipment Scanner

Purpose:

Verify whether required physical infrastructure is actually available.

Possible objects:

- Computers
- Chairs
- Whiteboards
- Welding tools
- Safety equipment
- Other programme-specific equipment

Workflow:

```text
Mobile/Web Camera
      ↓
Multiple Views / 360° Scan
      ↓
Object Detection
      ↓
Object Counting
      ↓
Compare With Requirements
      ↓
Infrastructure Compliance Score
      ↓
Missing / Insufficient Equipment Alert
```

Technology direction:

- YOLOv8/custom YOLO model
- Roboflow/custom dataset
- React / React Native camera interface

---

## 4.3 Geofenced Liveness Check

Purpose:

Ensure that attendance/check-in is associated with a real person physically present at the centre.

Checks may include:

- GPS location
- Geofence
- Face liveness
- Blink
- Smile
- Presence verification

Workflow:

```text
Student Check-in
      ↓
GPS Check
      ↓
Inside Centre Geofence?
      ↓
Liveness Check
      ↓
PASS / FAIL
      ↓
Attendance Verification
```

Technology direction:

- MediaPipe
- Google Maps API
- Flutter / React Native

---

## 4.4 Multimodal Fraud & Anomaly Engine

Purpose:

Combine multiple signals instead of judging a centre from a single event.

Possible signals:

- Attendance mismatch
- Face mismatch
- Liveness failure
- Geofence violation
- Missing infrastructure
- IP anomalies
- Power/telemetry anomalies
- Historical patterns

Workflow:

```text
Attendance Signals
Infrastructure Signals
Liveness Signals
Geofence Signals
Telemetry Signals
Historical Signals
        ↓
   ANOMALY ENGINE
        ↓
   RISK CALCULATION
        ↓
  EXPLANATION
        ↓
      ALERT
        ↓
     HUMAN AUDIT
```

---

# 5. High-Level System Architecture

```text
                         SACH
          Smart Attendance & Compliance Hub
                           │
                           ▼
                 ┌───────────────────┐
                 │     FRONTEND      │
                 │ React / Next.js   │
                 │ MSDE Control Tower│
                 └─────────┬─────────┘
                           │
                    REST + WebSocket
                           │
                           ▼
                 ┌───────────────────┐
                 │      BACKEND      │
                 │   FastAPI/Python  │
                 └─────────┬─────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     Attendance      Infrastructure      Liveness
       Engine             Engine           Engine
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                 Fraud / Anomaly Engine
                           │
                           ▼
                   ┌──────────────┐
                   │   DATABASE   │
                   │ PostgreSQL   │
                   └──────┬───────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
          Alerts        Audits       Reports
             │            │
             └────────────┘
                    │
                    ▼
              MSDE Officials
```

---

# 6. Frontend Information Architecture

## Recommended Primary Pages

The prototype should have approximately **10 primary navigation categories**.

### Authentication

1. Login

### Overview

2. Dashboard
3. Live Monitoring
4. Centres

### Monitoring

5. Attendance
6. Infrastructure
7. Alerts

### Audit & Intelligence

8. Audits
9. Reports

### Administration

10. Settings

### Supporting/detail pages

- Centre Details
- Alert Details
- Audit Details
- Map/Geo Monitoring

These detail pages should generally open from their respective primary sections rather than cluttering the sidebar.

---

# 7. Sidebar Navigation

Recommended government-grade sidebar:

```text
SACH
Smart Attendance & Compliance Hub

────────────────────────────

OVERVIEW
  Dashboard
  Live Monitoring
  Centres

MONITORING
  Attendance
  Infrastructure
  Alerts

AUDIT & INTELLIGENCE
  Audits
  Reports

────────────────────────────

ADMINISTRATION
  Settings

────────────────────────────

MSDE OFFICIAL
Government Inspector
```

---

# 8. Page Routing

Recommended frontend routes:

```text
/login

/dashboard

/monitoring

/centres
/centres/:centreId

/attendance

/infrastructure

/alerts
/alerts/:alertId

/audits
/audits/:auditId

/reports

/settings
```

---

# 9. PAGE 1 — LOGIN

## Route

```text
/login
```

## Header

```text
SACH
Smart Attendance & Compliance Hub

AI-powered Training Centre Monitoring & Compliance Platform
```

## Form

```text
Email / Official ID
Password
Role
```

Roles:

```text
MSDE Official
NCVT Inspector
Training Centre Administrator
```

## Button

```text
Sign In
```

## Footer

```text
Government Training Monitoring System
SIH Problem Statement 245
```

---

# 10. PAGE 2 — DASHBOARD

## Route

```text
/dashboard
```

This is the main **MSDE Control Tower**.

## Header

```text
TRAINING CENTRE CONTROL TOWER

National Training Centre Overview

Last updated: 10:42 AM
```

Actions:

```text
[ Date ]
[ Refresh ]
```

---

## KPI Cards

### Total Centres

```text
248
```

### Currently Monitored

```text
187
```

### Compliance Rate

```text
91.4%
```

### High Risk Centres

```text
17
```

### Active Alerts

```text
32
```

---

## Centre Risk Overview

Chart:

```text
Centre Risk Distribution

Low        █████████████
Medium     ███████
High       ███
Critical   ██
```

---

## Live Situation

### Attendance

```text
Expected Students    1,842
Currently Detected   1,726
Attendance Rate      93.7%
```

### Infrastructure

```text
Compliant Centres       214
Needs Attention          25
Non-Compliant             9
```

### Alerts

```text
Critical                  4
High                     11
Medium                   17
```

---

## Priority Centres

Recommended table:

| Centre | Attendance | Infrastructure | Risk | Status |
|---|---:|---:|---:|---|
| Government Skill Centre Jaipur | 72% | 81% | 86% | High Risk |
| ABC Training Hub | 96% | 94% | 18% | Normal |
| XYZ Skill Centre | 81% | 68% | 74% | High Risk |

Clicking a row:

```text
/centres/:centreId
```

---

## Dashboard Map

Show training centres geographically.

Legend:

```text
Green  = Normal
Yellow = Medium
Orange = High
Red    = Critical
```

Clicking a marker should show:

```text
Centre Name
Risk Score
Attendance
Compliance
[View Centre]
```

---

# 11. PAGE 3 — LIVE MONITORING

## Route

```text
/monitoring
```

Purpose:

Real-time CCTV/webcam monitoring.

## Header

```text
LIVE MONITORING

[ Select Centre ]
[ Select Classroom ]

● LIVE
```

---

## Camera Feed

Main panel:

```text
┌─────────────────────────────┐
│                             │
│       LIVE CAMERA           │
│                             │
│   Person Detection Boxes    │
│   Face Recognition Labels   │
│                             │
└─────────────────────────────┘
```

---

## Live Statistics

```text
EXPECTED
30

DETECTED
27

RECOGNIZED
25

UNKNOWN
2
```

---

## Attendance State

```text
Present              25
Missing                3
Unknown                2
Mid-session Exit       1
```

---

## Event Timeline

```text
09:00  Session started
09:15  30 students detected
09:42  Student #104 missing
10:05  Unknown face detected
10:18  3 students left session
```

---

# 12. PAGE 4 — CENTRES

## Route

```text
/centres
```

Purpose:

Show all registered training centres.

## Header

```text
Training Centres

Monitor attendance, infrastructure and compliance status across registered centres.
```

## Filters

```text
Search Centre
State
District
Programme
Risk Level
Compliance
Status
```

## Table

```text
Centre ID
Centre Name
Location
Students
Attendance
Infrastructure
Risk
Last Scan
Status
```

---

# 13. PAGE 5 — CENTRE DETAILS

## Route

```text
/centres/:centreId
```

Purpose:

Complete profile and operational view of one centre.

## Header

```text
Government Skill Centre Jaipur

Centre ID: TC-001
Jaipur, Rajasthan

● Operational
```

Actions:

```text
[ Start Audit ]
[ Export Report ]
```

---

## KPI Cards

```text
Attendance        93%
Infrastructure    88%
Fraud Risk        24%
Active Alerts      3
```

---

## Centre Tabs

```text
Overview
Attendance
Infrastructure
Risk & Anomalies
Alerts
Audit History
```

---

## Overview

### Centre Information

```text
Centre ID
Centre Name
Address
District
State
Training Programme
Administrator
Registration Date
```

### Current Session

```text
Classroom: Room 02
Trainer: Rajesh Kumar
Expected: 30
Detected: 28
Status: Active
```

### Risk Summary

```text
Attendance Risk          Low
Infrastructure Risk      Medium
Liveness Risk             Low
Telemetry Risk            Low

Overall Risk              28%
```

---

# 14. PAGE 6 — ATTENDANCE

## Route

```text
/attendance
```

Purpose:

Detailed attendance investigation and analytics.

## Filters

```text
Centre
Date
Session
Batch
```

## KPI Cards

```text
Expected Students      30
Present                27
Missing                 3
Mid-session Dropout     2
Suspicious               1
```

## Student Table

```text
Student
ID
Expected
Detected
Check-in
Last Seen
Liveness
Status
```

Example statuses:

```text
Present
Absent
Left Early
Unknown
Liveness Failed
```

---

# 15. PAGE 7 — INFRASTRUCTURE AUDIT

## Route

```text
/infrastructure
```

Purpose:

AI-based verification of physical infrastructure.

## Header

```text
INFRASTRUCTURE AUDIT

[ Select Centre ]
[ Start New Scan ]
```

---

## Scanner

Left:

```text
CAMERA PREVIEW
```

Right:

```text
SCAN STATUS

Views captured     4/6
Objects detected   42

AI ANALYSIS
Running...
```

---

## Compliance Result

Example:

```text
OVERALL COMPLIANCE

87%
```

Table:

| Equipment | Required | Detected | Status |
|---|---:|---:|---|
| Computers | 20 | 18 | Warning |
| Chairs | 30 | 30 | Compliant |
| Whiteboards | 2 | 2 | Compliant |
| Safety Kits | 10 | 6 | Warning |
| Welding Tools | 8 | 8 | Compliant |

---

## Evidence

Show scanned images with detection bounding boxes.

```text
[ Scan Image 1 ]
[ Scan Image 2 ]
[ Scan Image 3 ]
[ Scan Image 4 ]
```

---

# 16. PAGE 8 — ALERTS

## Route

```text
/alerts
```

Purpose:

Central incident/alert inbox.

## Header

```text
Alerts & Incidents

32 Active Alerts
```

## Filters

```text
Severity
Type
Centre
Date
Status
```

---

## Alert Types

```text
Attendance Mismatch
Face Mismatch
Liveness Failure
Geofence Violation
Missing Equipment
IP Anomaly
Power/Telemetry Anomaly
Combined Anomaly
```

---

## Example Alert

### HIGH — Attendance Mismatch

```text
Centre: TC-021
Expected: 40
Detected: 24
Difference: 16

Detected at: 10:42 AM

[View Evidence]
[Investigate]
```

---

# 17. ALERT DETAIL

## Route

```text
/alerts/:alertId
```

## Alert Summary

```text
Alert ID
Centre
Timestamp
Severity
Category
Current Status
```

## Why Was This Flagged?

Example:

```text
Registered students: 50
Officially marked present: 40
Detected students: 24
Attendance discrepancy: 16
Attendance risk: 40%
Similar mismatch observed in previous sessions
Centre infrastructure compliance: 78%

Combined indicators suggest elevated risk.
```

Important UI disclaimer:

> **This alert is an AI-generated risk indicator and does not by itself prove fraud.**

---

# 18. PAGE 9 — AUDIT MANAGEMENT

## Route

```text
/audits
```

Purpose:

Convert AI-generated risk signals into a human investigation workflow.

## Workflow

```text
Risk Detected
      ↓
Alert Generated
      ↓
Official Reviews Evidence
      ↓
Audit Created
      ↓
Inspector Assigned
      ↓
Inspection
      ↓
Findings
      ↓
Resolution
```

## Audit Table

```text
Audit ID
Centre
Reason
Priority
Assigned Inspector
Created
Due Date
Status
```

## Statuses

```text
Pending
Assigned
In Progress
Completed
Escalated
Closed
```

---

# 19. AUDIT DETAIL

## Route

```text
/audits/:auditId
```

## Header

```text
AUDIT #AUD-1021

Government Skill Centre Jaipur

Priority: HIGH
Status: IN PROGRESS
```

## Evidence Checklist

```text
✓ Attendance records
✓ CCTV evidence
✓ Infrastructure scan
✓ Liveness logs
☐ Physical inspection
☐ Corrective action
```

## Inspector Findings

```text
Finding Category
Description
Evidence
Severity
```

## Final Decision

```text
Compliant
Minor Non-Compliance
Major Non-Compliance
Escalate
```

---

# 20. PAGE 10 — REPORTS

## Route

```text
/reports
```

## Report Types

```text
Centre Compliance Report
Attendance Report
Infrastructure Report
Fraud Risk Report
Audit Report
Monthly Monitoring Report
```

## Filters

```text
Date Range
State
District
Centre
Risk
```

## Actions

```text
[ Generate ]
[ PDF ]
[ CSV ]
```

---

# 21. SETTINGS

## Route

```text
/settings
```

Sections:

```text
Profile
Centre Configuration
Compliance Requirements
Alert Thresholds
User Management
System Settings
```

For the SIH MVP, keep this page lightweight.

---

# 22. Role-Based Access

SACH should support three primary roles.

## 22.1 MSDE Official

Can view:

```text
Dashboard
Live Monitoring
All Centres
Attendance
Infrastructure
Alerts
Audits
Reports
Settings
```

Purpose:

National/state-level oversight.

---

## 22.2 NCVT Inspector

Can view:

```text
Dashboard
Assigned Centres
Live Monitoring
Attendance
Infrastructure
Alerts
Audits
Reports
```

Purpose:

Investigation and inspection.

---

## 22.3 Training Centre Administrator

Can view:

```text
Centre Dashboard
Attendance
Infrastructure
Students
Sessions
Alerts
Reports
```

Should not have access to sensitive national-level risk rankings or other centres.

---

# 23. Database Architecture

Recommended database:

```text
PostgreSQL
```

SQLite may be used for an early prototype.

---

# 24. Main Database Tables

```text
users
training_centres
programmes
batches
students
trainers
sessions

attendance_events
liveness_checks
geofence_events

equipment_requirements
infrastructure_scans
detected_equipment

telemetry_events
anomaly_events
centre_risk_scores

alerts
audits
audit_findings
evidence_files

notifications
system_logs
```

---

# 25. Database Relationship

```text
USER
 │
 ├───────────────┐
 ▼               ▼
CENTRE          AUDITS
 │
 ├──────────────┐
 ▼              ▼
BATCHES       SESSIONS
 │              │
 ▼              ▼
STUDENTS     ATTENDANCE
                │
                ▼
            LIVENESS
                │
                ▼
             GEOFENCE


CENTRE
  │
  ▼
INFRASTRUCTURE SCAN
  │
  ▼
DETECTED EQUIPMENT
  │
  ▼
COMPLIANCE


CENTRE
  │
  ├── Attendance Signals
  ├── Infrastructure Signals
  ├── Liveness Signals
  ├── Geofence Signals
  ├── IP Signals
  └── Power Signals
          │
          ▼
     ANOMALY ENGINE
          │
          ▼
      RISK SCORE
          │
          ▼
        ALERT
          │
          ▼
        AUDIT
```

---

# 26. `users`

```text
id
name
email
password_hash
role
phone
status
created_at
updated_at
```

Roles:

```text
MSDE_OFFICIAL
INSPECTOR
CENTRE_ADMIN
```

---

# 27. `training_centres`

```text
id
centre_code
name
address
district
state
latitude
longitude
geofence_radius
administrator_id
status
created_at
updated_at
```

---

# 28. `students`

```text
id
centre_id
batch_id
student_code
name
photo
face_embedding
date_of_birth
status
created_at
```

> Biometric data such as face embeddings requires appropriate privacy, access control and security measures in a real deployment.

---

# 29. `sessions`

```text
id
centre_id
batch_id
trainer_id
room
start_time
end_time
status
```

---

# 30. `attendance_events`

```text
id
session_id
student_id
event_type
detected_at
confidence
source
camera_id
status
```

Event types:

```text
PRESENT
ABSENT
ENTERED
EXITED
MID_SESSION_EXIT
UNKNOWN
```

---

# 31. `liveness_checks`

```text
id
student_id
session_id
timestamp
check_type
result
confidence
device_id
```

Results:

```text
PASSED
FAILED
```

---

# 32. `geofence_events`

```text
id
student_id
centre_id
timestamp
latitude
longitude
distance_from_centre
inside_geofence
```

---

# 33. `equipment_requirements`

```text
id
centre_id
equipment_type
required_quantity
minimum_quantity
programme
```

Example:

```text
Computer → 20
Chair → 30
Whiteboard → 2
Safety Kit → 10
```

---

# 34. `infrastructure_scans`

```text
id
centre_id
scan_time
compliance_score
scanner_user
status
```

---

# 35. `detected_equipment`

```text
id
scan_id
equipment_type
required_quantity
detected_quantity
confidence
evidence_image
status
```

---

# 36. `anomaly_events`

This is the central fraud/anomaly table.

```text
id
centre_id
type
severity
score
description
source
detected_at
metadata
status
```

Types:

```text
ATTENDANCE_MISMATCH
FACE_MISMATCH
LIVENESS_FAILURE
GEOFENCE_VIOLATION
EQUIPMENT_MISSING
IP_ANOMALY
POWER_ANOMALY
COMBINED_ANOMALY
```

---

# 37. `centre_risk_scores`

```text
id
centre_id
attendance_risk
infrastructure_risk
liveness_risk
telemetry_risk
historical_risk
overall_risk
calculated_at
```

---

# 38. `alerts`

```text
id
centre_id
anomaly_id
title
description
severity
status
assigned_to
created_at
acknowledged_at
resolved_at
```

Statuses:

```text
NEW
ACKNOWLEDGED
UNDER_REVIEW
AUDIT_ASSIGNED
RESOLVED
DISMISSED
```

---

# 39. `audits`

```text
id
centre_id
alert_id
inspector_id
priority
reason
scheduled_date
started_at
completed_at
status
final_result
notes
```

---

# 40. Backend Architecture

Recommended structure:

```text
backend/
│
├── app/
│   │
│   ├── main.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── database.py
│   │   └── logging.py
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── centre.py
│   │   ├── student.py
│   │   ├── session.py
│   │   ├── attendance.py
│   │   ├── infrastructure.py
│   │   ├── anomaly.py
│   │   ├── alert.py
│   │   └── audit.py
│   │
│   ├── schemas/
│   │   ├── auth.py
│   │   ├── centre.py
│   │   ├── attendance.py
│   │   ├── infrastructure.py
│   │   ├── alert.py
│   │   └── audit.py
│   │
│   ├── api/
│   │   ├── auth.py
│   │   ├── dashboard.py
│   │   ├── centres.py
│   │   ├── attendance.py
│   │   ├── infrastructure.py
│   │   ├── monitoring.py
│   │   ├── alerts.py
│   │   ├── audits.py
│   │   └── reports.py
│   │
│   ├── services/
│   │   ├── attendance_service.py
│   │   ├── infrastructure_service.py
│   │   ├── liveness_service.py
│   │   ├── geofence_service.py
│   │   ├── anomaly_service.py
│   │   ├── risk_service.py
│   │   ├── alert_service.py
│   │   └── audit_service.py
│   │
│   ├── ml/
│   │   ├── person_detection.py
│   │   ├── face_recognition.py
│   │   ├── equipment_detection.py
│   │   ├── liveness.py
│   │   └── anomaly_detection.py
│   │
│   └── websocket/
│       └── monitoring.py
│
├── ml_models/
│   ├── person_detection.pt
│   ├── equipment_detection.pt
│   └── ...
│
├── tests/
├── requirements.txt
└── .env
```

---

# 41. API Architecture

## Authentication

```http
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

## Dashboard

```http
GET /api/dashboard/summary
GET /api/dashboard/risk-distribution
GET /api/dashboard/priority-centres
GET /api/dashboard/alerts
```

## Centres

```http
GET    /api/centres
POST   /api/centres
GET    /api/centres/{id}
PUT    /api/centres/{id}
DELETE /api/centres/{id}
```

## Attendance

```http
GET /api/attendance
GET /api/attendance/summary
GET /api/attendance/student/{id}
GET /api/attendance/session/{id}
POST /api/attendance/event
```

## Monitoring

```http
GET /api/monitoring/{centre_id}
WS  /ws/monitoring/{centre_id}
```

---

# 42. WebSocket Events

Real-time monitoring can push:

```text
person_detected
face_recognized
student_missing
student_exit
unknown_face
camera_status
anomaly_detected
```

---

# 43. Infrastructure APIs

```http
POST /api/infrastructure/scans
GET  /api/infrastructure/scans/{centre_id}
GET  /api/infrastructure/requirements/{centre_id}
POST /api/infrastructure/detect
GET  /api/infrastructure/compliance/{centre_id}
```

---

# 44. Liveness & Geofence APIs

```http
POST /api/liveness/check
POST /api/geofence/check
GET  /api/liveness/{student_id}
```

---

# 45. Fraud/Anomaly APIs

```http
POST /api/anomalies/analyze/{centre_id}
GET  /api/anomalies/{centre_id}
GET  /api/risk/{centre_id}
```

---

# 46. Risk Engine

The backend receives:

```text
Attendance
     +
Infrastructure
     +
Liveness
     +
Geofence
     +
IP / Telemetry
     +
Historical Behaviour
```

Then:

```text
ANOMALY DETECTION
       ↓
RISK CALCULATION
       ↓
EXPLANATION
       ↓
ALERT
```

---

# 47. Proposed Risk Score

The following weights are **proposed for the prototype** and should be tuned using test data.

```text
Attendance Risk          30%
Infrastructure Risk      25%
Liveness / Identity      15%
Geofence Risk            10%
Telemetry Risk            10%
Historical Risk           10%
                         ───
                         100%
```

Risk levels:

```text
0–24       LOW
25–49      MEDIUM
50–74      HIGH
75–100     CRITICAL
```

Interpretation:

```text
LOW
Normal monitoring

MEDIUM
Review recommended

HIGH
Priority review

CRITICAL
Audit recommended
```

---

# 48. Important Risk Principle

Never implement:

```text
AI Risk = 90%
        ↓
Fraud Confirmed
```

Instead:

```text
AI Risk = 90%
        ↓
High Priority Alert
        ↓
Official Reviews Evidence
        ↓
Audit
        ↓
Human Decision
```

SACH is a **decision-support and monitoring system**, not an automatic legal judgement system.

---

# 49. AI/ML Architecture

## Engine 1 — Attendance Vision

```text
Camera
 ↓
Person Detection
 ↓
Face Detection
 ↓
Face Recognition
 ↓
Roster Matching
 ↓
Attendance Event
```

## Engine 2 — Infrastructure Vision

```text
Camera
 ↓
YOLO
 ↓
Equipment Detection
 ↓
Object Counting
 ↓
Requirement Comparison
 ↓
Compliance %
```

## Engine 3 — Liveness

```text
Camera
 ↓
Face
 ↓
Blink / Smile / Liveness
 ↓
PASS / FAIL
```

## Engine 4 — Anomaly Detection

```text
Attendance
Infrastructure
Liveness
Geofence
Telemetry
Historical Data
       ↓
Anomaly Engine
       ↓
Risk Score
```

---

# 50. Frontend Component Architecture

```text
frontend/
│
├── app/
│   ├── login/
│   ├── dashboard/
│   ├── centres/
│   ├── monitoring/
│   ├── attendance/
│   ├── infrastructure/
│   ├── alerts/
│   ├── audits/
│   ├── reports/
│   └── settings/
│
├── components/
│   ├── layout/
│   │   ├── Sidebar
│   │   ├── Header
│   │   └── PageHeader
│   │
│   ├── dashboard/
│   │   ├── KPICard
│   │   ├── RiskChart
│   │   ├── CentreTable
│   │   └── RiskMap
│   │
│   ├── monitoring/
│   │   ├── CameraFeed
│   │   ├── LiveStats
│   │   └── EventTimeline
│   │
│   ├── attendance/
│   │   ├── AttendanceSummary
│   │   └── StudentTable
│   │
│   ├── infrastructure/
│   │   ├── Scanner
│   │   ├── EquipmentTable
│   │   └── ComplianceScore
│   │
│   ├── alerts/
│   │   ├── AlertCard
│   │   └── AlertFilters
│   │
│   └── audits/
│       ├── AuditTable
│       ├── AuditTimeline
│       └── FindingsForm
│
├── services/
│   ├── api.ts
│   ├── auth.ts
│   ├── centres.ts
│   ├── attendance.ts
│   ├── infrastructure.ts
│   ├── alerts.ts
│   └── audits.ts
│
└── store/
    ├── authStore
    ├── dashboardStore
    └── monitoringStore
```

---

# 51. End-to-End Attendance Workflow

```text
Student enters classroom
        ↓
Camera captures scene
        ↓
Person detected
        ↓
Face detected
        ↓
Face compared with registered roster
        ↓
Identity confidence calculated
        ↓
Attendance event created
        ↓
Liveness/geofence verification if required
        ↓
Student marked present
        ↓
Continuous monitoring
        ↓
Student leaves early?
        ↓
Mid-session exit event
        ↓
Attendance analytics updated
        ↓
Anomaly engine receives signal
```

---

# 52. End-to-End Infrastructure Workflow

```text
Inspector / Centre Admin starts scan
        ↓
Camera captures multiple views
        ↓
Images uploaded
        ↓
Object detection model runs
        ↓
Equipment counted
        ↓
Required equipment loaded from database
        ↓
Detected vs required comparison
        ↓
Compliance percentage calculated
        ↓
Evidence images stored
        ↓
Missing equipment identified
        ↓
Alert generated if threshold crossed
```

---

# 53. End-to-End Fraud/Anomaly Workflow

```text
Attendance mismatch
        +
Face mismatch
        +
Liveness failure
        +
Infrastructure mismatch
        +
Geofence anomaly
        +
Telemetry anomaly
        +
Historical behaviour
        ↓
MULTIMODAL ANOMALY ENGINE
        ↓
Risk Score
        ↓
Explainable Risk Factors
        ↓
Alert
        ↓
Human Review
        ↓
Audit
        ↓
Finding
        ↓
Resolution
```

---

# 54. Complete Centre Lifecycle

```text
Centre Registered
      ↓
Programme Configured
      ↓
Students / Trainers Added
      ↓
Centre Requirements Added
      ↓
Sessions Created
      ↓
Live Attendance Monitoring
      ↓
Infrastructure Scans
      ↓
Liveness / Geofence Verification
      ↓
Signals Correlated
      ↓
Risk Score Generated
      ↓
Alert if required
      ↓
Inspector Reviews
      ↓
Audit
      ↓
Finding
      ↓
Corrective Action
      ↓
Resolution
      ↓
Historical Record
```

---

# 55. Demo Data Strategy

For the SIH prototype, use realistic synthetic data where live government data is unavailable.

Example:

```text
Total Centres: 248
Normal: 190
Medium: 41
High: 13
Critical: 4
```

Example centre:

```text
Centre: Government Skill Centre Jaipur
Students: 120
Current Attendance: 93%
Infrastructure Compliance: 88%
Risk Score: 24%
Active Alerts: 3
```

For a suspicious centre:

```text
Expected Students: 40
Detected Students: 24
Infrastructure Compliance: 78%
Liveness Failures: 3
Historical Attendance Mismatches: 4
Risk Score: 82%
Status: Critical
```

> Synthetic/demo data must be clearly represented as demo data rather than real government records.

---

# 56. MVP Scope

## MUST HAVE

```text
1. Login
2. Dashboard
3. Centre List
4. Centre Detail
5. Live Attendance Demo
6. Infrastructure Scan Demo
7. Attendance Analytics
8. Alerts
9. Risk Score
10. Audit Workflow
```

## SHOULD HAVE

```text
11. Map
12. Reports
13. Liveness
14. Geofence
15. WebSocket Live Updates
```

## FUTURE / ADVANCED

```text
16. Real Power Telemetry
17. Real IP Correlation
18. Advanced Anomaly ML
19. Mobile Application
20. Automated Notifications
```

---

# 57. Security & Privacy

The system should include:

```text
JWT / secure authentication
Role-based access control
Password hashing
HTTPS in deployment
Input validation
API authorization
Audit logging
Secure file storage
Restricted biometric access
Sensitive data encryption
Environment variables for secrets
```

Never hardcode:

```text
Database passwords
JWT secrets
API keys
Cloud credentials
Model access credentials
```

Use `.env` for development.

---

# 58. Environment Variables

Example:

```env
DATABASE_URL=
JWT_SECRET=
ACCESS_TOKEN_EXPIRE_MINUTES=
GOOGLE_MAPS_API_KEY=
MODEL_PATH=
UPLOAD_DIR=
CORS_ORIGINS=
```

---

# 59. Recommended Tech Stack

## Frontend

```text
React / Next.js
Tailwind CSS
Lucide Icons
Recharts
Map library
WebSocket client
```

## Backend

```text
Python
FastAPI
Pydantic
SQLAlchemy
JWT Authentication
WebSockets
```

## Database

```text
PostgreSQL
```

SQLite can be used for initial development.

## AI / Computer Vision

```text
OpenCV
YOLOv8 / YOLO11
InsightFace / DeepFace
MediaPipe
Scikit-learn
Pandas
Roboflow
```

## Version Control

```text
Git
GitHub
```

---

# 60. Recommended Development Order

Do NOT build everything simultaneously.

## Phase 1 — Foundation

```text
1. Create repository
2. Create frontend
3. Create backend
4. Configure database
5. Implement authentication
6. Create basic layout/sidebar
```

## Phase 2 — Core UI

```text
7. Dashboard
8. Centres
9. Centre Detail
10. Attendance page
11. Infrastructure page
12. Alerts
13. Audits
14. Reports
```

## Phase 3 — Backend APIs

```text
15. Auth APIs
16. Centre APIs
17. Attendance APIs
18. Infrastructure APIs
19. Alert APIs
20. Audit APIs
21. Report APIs
```

## Phase 4 — AI

```text
22. Person detection
23. Face recognition
24. Attendance pipeline
25. Equipment detection
26. Infrastructure compliance
27. Liveness
28. Anomaly engine
```

## Phase 5 — Real-time

```text
29. WebSockets
30. Live camera events
31. Live dashboard updates
32. Alert notifications
```

## Phase 6 — Demo Polish

```text
33. Seed realistic data
34. Add evidence images
35. Add charts
36. Add map
37. Add report export
38. Test complete workflow
39. Improve UI
40. Prepare SIH demo
```

---

# 61. Final User Journey

```text
                        LOGIN
                          │
                          ▼
                     DASHBOARD
                          │
            ┌─────────────┼─────────────┐
            │             │             │
            ▼             ▼             ▼
         CENTRES        ALERTS        REPORTS
            │
            ▼
       CENTRE DETAIL
            │
     ┌──────┼───────────────┐
     │      │               │
     ▼      ▼               ▼
ATTENDANCE INFRASTRUCTURE   RISK
     │      │               │
     ▼      ▼               ▼
   CCTV    CAMERA        ANOMALIES
     │      │               │
     ▼      ▼               ▼
  FACE     YOLO         RISK SCORE
     │      │               │
     └──────┼───────────────┘
            ▼
          ALERT
            │
            ▼
         REVIEW
            │
            ▼
          AUDIT
            │
            ▼
         FINDINGS
            │
            ▼
        RESOLUTION
```

---

# 62. Final Full-System Architecture

```text
                         ┌─────────────────────────┐
                         │          SACH           │
                         │ Smart Attendance &       │
                         │ Compliance Hub           │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │       FRONTEND          │
                         │ React / Next.js          │
                         │ MSDE Control Tower       │
                         └────────────┬────────────┘
                                      │
                           REST API + WebSocket
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │        FASTAPI          │
                         │       BACKEND           │
                         └────────────┬────────────┘
                                      │
       ┌──────────────────────────────┼─────────────────────────────┐
       │                              │                             │
       ▼                              ▼                             ▼
┌──────────────┐             ┌────────────────┐             ┌──────────────┐
│ Attendance   │             │ Infrastructure │             │  Liveness &  │
│ CV Engine    │             │ CV Engine      │             │  Geofence    │
└──────┬───────┘             └───────┬────────┘             └──────┬───────┘
       │                             │                             │
       └─────────────────────────────┼─────────────────────────────┘
                                     ▼
                           ┌───────────────────┐
                           │ Anomaly / Risk    │
                           │ Engine            │
                           └─────────┬─────────┘
                                     │
                                     ▼
                           ┌───────────────────┐
                           │    PostgreSQL     │
                           │     Database      │
                           └─────────┬─────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
               ALERTS              AUDITS             REPORTS
                  │                  │
                  └──────────────────┘
                           │
                           ▼
                    MSDE / INSPECTOR
                           │
                           ▼
                    HUMAN DECISION
```

---

# 63. Final Product Definition

> **SACH (Smart Attendance & Compliance Hub) is an AI-powered GovTech platform for real-time monitoring of training centres. It verifies attendance through computer vision, checks physical infrastructure through AI-based object detection, validates presence using liveness and geofencing, correlates multiple operational signals to identify anomalies, generates explainable centre-level risk scores, and routes high-risk cases to human inspectors for evidence-based audit and resolution.**

---

# 64. Final UI Design Direction

The interface should be:

```text
Government-grade
Enterprise
Professional
Clean
Light UI
White background
Data-driven
Minimal decoration
High information clarity
Responsive
Accessible
```

Avoid:

```text
Excessive gradients
Gaming-style UI
Huge animations
Unnecessary glassmorphism
Overly colorful cards
Fake AI gimmicks
Cluttered dashboards
```

The visual language should communicate:

> **Official + trustworthy + analytical + operational**

---

# 65. Most Important Product Rule

SACH should never communicate:

> "AI found fraud."

Instead communicate:

> "AI identified a high-risk pattern requiring official review."

This keeps the product:

- Explainable
- Responsible
- Auditable
- Government-appropriate
- Human-in-the-loop

---

# 66. Short Pitch

> **SACH is a digital AI inspector for government training centres. It continuously verifies attendance, infrastructure and physical presence, identifies suspicious inconsistencies across multiple data sources, assigns an explainable risk score, and helps inspectors decide where an audit is actually needed.**

---

# 67. Project Naming

## SACH

### Smart Attendance & Compliance Hub

Meaning:

**SACH = Truth**

Concept:

> The system checks whether what a training centre claims is actually true on the ground.

Suggested tagline:

### **“See the Reality. Verify the Compliance.”**

Alternative:

### **“Turning Training Centre Claims into Verifiable Evidence.”**

---

# 68. Final Implementation Principle

Build SACH as:

```text
A CONTROL TOWER
        +
AI INSPECTION ENGINE
        +
EVIDENCE SYSTEM
        +
RISK ENGINE
        +
AUDIT WORKFLOW
```

Not merely as:

```text
Camera + Attendance App
```

The strength of SACH is the **combination of multiple signals and the conversion of those signals into actionable, explainable and auditable decisions.**

---

## END OF ARCHITECTURE DOCUMENT

**Project:** SACH
**Full Form:** Smart Attendance & Compliance Hub
**Team:** Heisen-de-Bug
**SIH PS:** 245
**Status:** Proposed Prototype Architecture
