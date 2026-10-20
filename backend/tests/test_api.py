import base64
import asyncio
import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request
from starlette.responses import Response
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main as sach


class ApiBehaviorTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        sach.Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autoflush=False,
            expire_on_commit=False,
        )
        self.db = self.session_factory()
        self.db.add(sach.CentreRecord(
            centre_id="TEST_001",
            name="Test Training Centre",
            registered_total=10,
            official_marked_present=10,
            live_headcount=0,
            detected_computers=7,
            required_computers=10,
            compliance_percentage=70,
            fraud_risk_score=80,
            status="HIGH_RISK",
            equipment_config=json.dumps({
                "classes": [
                    {"name": "computer", "label": "Computers", "required": 10},
                    {"name": "chair", "label": "Chairs", "required": 5},
                ],
            }),
        ))
        self.db.commit()
        sach.db_store["attendance_logs"] = []
        sach.db_store["audit_logs"] = []
        sach.db_store["centres"] = {}
        sach.live_infrastructure.clear()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        sach.db_store["attendance_logs"] = []
        sach.db_store["audit_logs"] = []
        sach.db_store["centres"] = {}
        sach.live_infrastructure.clear()

    @staticmethod
    def request_for(username, role=None, centre_id=None):
        request = SimpleNamespace()
        request.state = SimpleNamespace(auth_user={
            "username": username,
            "role": role,
            "centre_id": centre_id,
        })
        request.client = SimpleNamespace(host="127.0.0.1")
        request.headers = {"user-agent": "sach-test"}
        return request

    def auth_request(self, method, path, role, include_token=True):
        suffix = sach.secrets.token_hex(4)
        user = sach.AuthUser(
            username=f"test-{role.lower()}-{suffix}",
            password_hash=sach._hash_password("correct-horse-battery-staple"),
            role=role,
            centre_id="TEST_001" if role == "OPERATOR" else None,
            created_at="2026-10-12T10:00:00+00:00",
        )
        self.db.add(user)
        self.db.flush()
        token = f"token-{role.lower()}-{suffix}"
        self.db.add(sach.AuthSession(
            user_id=user.id,
            token_hash=sach.hashlib.sha256(token.encode()).hexdigest(),
            expires_at=(sach._utc_now() + sach.timedelta(hours=1)).isoformat(),
        ))
        self.db.commit()
        headers = []
        if include_token:
            headers.append((b"authorization", f"Bearer {token}".encode()))
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "headers": headers,
            "client": ("testclient", 123),
            "server": ("testserver", 80),
        }
        return Request(scope)

    def test_live_feed_replays_latest_frame_for_exact_centre_and_stream(self):
        class MemoryWebSocket:
            def __init__(self):
                self.accepted = False
                self.messages = []

            async def accept(self):
                self.accepted = True

            async def send_json(self, message):
                self.messages.append(message)

        manager = sach.ConnectionManager()
        delhi_feed = MemoryWebSocket()
        jaipur_feed = MemoryWebSocket()

        async def prepare_feeds():
            await manager.broadcast(
                "DELHI_001",
                "attendance",
                {"frame": "delhi-frame", "camera_id": "DELHI_001:camera-0"},
            )
            await manager.broadcast("JAIPUR_001", "attendance", {"frame": "jaipur-frame"})
            await manager.broadcast("DELHI_001", "infrastructure", {"frame": "audit-frame"})
            await manager.connect(delhi_feed, "DELHI_001", "attendance")
            await manager.connect(jaipur_feed, "JAIPUR_001", "attendance")

        asyncio.run(prepare_feeds())

        self.assertTrue(delhi_feed.accepted)
        self.assertTrue(jaipur_feed.accepted)
        self.assertEqual(delhi_feed.messages[0]["frame"], "delhi-frame")
        self.assertEqual(delhi_feed.messages[0]["centre_id"], "DELHI_001")
        self.assertEqual(delhi_feed.messages[0]["stream_type"], "attendance")
        self.assertEqual(delhi_feed.messages[0]["camera_id"], "DELHI_001:camera-0")
        self.assertEqual(jaipur_feed.messages[0]["frame"], "jaipur-frame")
        self.assertIn("received_at", delhi_feed.messages[0])
        self.assertNotEqual(delhi_feed.messages[0]["frame"], "audit-frame")

    def test_websocket_authorization_enforces_role_and_operator_centre_scope(self):
        operator = {"role": "CENTRE_OPERATOR", "centre_id": "TEST_001"}
        official = {"role": "OFFICIAL", "centre_id": None}
        auditor = {"role": "AUDITOR", "centre_id": None}

        self.assertTrue(sach._websocket_role_allowed(
            operator, "TEST_001", "attendance", upload=True
        ))
        self.assertFalse(sach._websocket_role_allowed(
            operator, "OTHER_001", "attendance", upload=True
        ))
        self.assertFalse(sach._websocket_role_allowed(
            operator, "TEST_001", "infra", upload=True
        ))
        self.assertTrue(sach._websocket_role_allowed(
            official, "TEST_001", "infra", upload=True
        ))
        self.assertFalse(sach._websocket_role_allowed(
            auditor, "TEST_001", "infra", upload=True
        ))
        self.assertFalse(sach._websocket_role_allowed(
            official, "TEST_001", "unknown", upload=False
        ))

    def test_authenticated_live_api_and_websocket_use_transient_configured_metrics(self):
        user = sach.AuthUser(
            username="live-stream-official",
            password_hash=sach._hash_password("correct-horse-battery-staple"),
            role="OFFICIAL",
            created_at=sach._utc_now().isoformat(),
        )
        token = sach.secrets.token_urlsafe(24)
        self.db.add(user)
        self.db.flush()
        self.db.add(sach.AuthSession(
            user_id=user.id,
            token_hash=sach.hashlib.sha256(token.encode()).hexdigest(),
            expires_at=(sach._utc_now() + sach.timedelta(minutes=5)).isoformat(),
        ))
        self.db.commit()
        sach.db_store["centres"]["TEST_001"] = sach.centre_to_dict(
            self.db.get(sach.CentreRecord, "TEST_001")
        )
        client = TestClient(sach.app)

        with patch.object(sach, "SessionLocal", self.session_factory):
            unauthorized = client.post(
                "/api/audit/live",
                json={"centre_id": "TEST_001", "detected_computers": 5},
            )
            self.assertEqual(unauthorized.status_code, 401)

            headers = {"Authorization": f"Bearer {token}"}
            response = client.post(
                "/api/audit/live",
                json={"centre_id": "TEST_001", "detected_computers": 5},
                headers=headers,
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json()["live"]["compliance_percentage"], 50
            )
            self.assertEqual(
                self.db.query(sach.AuditRecord).count(), 0
            )

            with client.websocket_connect(
                "/ws/stream_upload/TEST_001/infra"
            ) as websocket:
                websocket.send_json({"type": "auth", "token": token})
                self.assertEqual(
                    websocket.receive_json()["type"], "authenticated"
                )
                websocket.send_json({
                    "frame": "encoded-frame",
                    "source_stream": "attendance",
                    "source_centre_id": "TEST_001",
                    "camera_id": "TEST_001:camera-0",
                    "detected_computers": 5,
                    "required_computers": 15,
                    "compliance_percentage": 100,
                    "status": "COMPLIANT",
                })

            with self.assertRaises(WebSocketDisconnect):
                with client.websocket_connect(
                    "/ws/stream_upload/TEST_001/infra"
                ) as websocket:
                    websocket.send_json({"type": "auth", "token": token})
                    self.assertEqual(
                        websocket.receive_json()["type"], "authenticated"
                    )
                    websocket.send_json({
                        "frame": "wrong-centre-frame",
                        "source_stream": "attendance",
                        "source_centre_id": "OTHER_001",
                        "camera_id": "OTHER_001:camera-0",
                        "detected_computers": 5,
                    })
                    websocket.receive_json()

        cached_frame = sach.connection_manager.latest_frames[
            ("TEST_001", "infra")
        ]
        self.assertEqual(cached_frame["required_computers"], 10)
        self.assertEqual(cached_frame["compliance_percentage"], 50.0)
        self.assertEqual(cached_frame["status"], "PARTIAL")
        self.assertEqual(cached_frame["centre_id"], "TEST_001")
        self.assertEqual(cached_frame["stream_type"], "infra")
        self.assertEqual(cached_frame["camera_id"], "TEST_001:camera-0")
        sach.connection_manager.latest_frames.pop(("TEST_001", "infra"), None)

    def test_infrastructure_frame_must_identify_same_centre_attendance_source(self):
        valid = {
            "source_stream": "attendance",
            "source_centre_id": "TEST_001",
            "camera_id": "TEST_001:camera-0",
        }
        self.assertTrue(sach._infra_frame_matches_source("TEST_001", valid))
        self.assertFalse(sach._infra_frame_matches_source(
            "TEST_001", {**valid, "source_centre_id": "OTHER_001"}
        ))
        self.assertFalse(sach._infra_frame_matches_source(
            "TEST_001", {**valid, "source_stream": "infra"}
        ))
        self.assertFalse(sach._infra_frame_matches_source(
            "TEST_001", {**valid, "camera_id": ""}
        ))

    def test_websocket_session_lookup_rejects_expired_or_revoked_sessions(self):
        user = sach.AuthUser(
            username="stream-user",
            password_hash=sach._hash_password("correct-horse-battery-staple"),
            role="OFFICIAL",
            created_at=sach._utc_now().isoformat(),
        )
        token = "stream-session-token"
        self.db.add(user)
        self.db.flush()
        session = sach.AuthSession(
            user_id=user.id,
            token_hash=sach.hashlib.sha256(token.encode()).hexdigest(),
            expires_at=(sach._utc_now() + sach.timedelta(minutes=5)).isoformat(),
        )
        self.db.add(session)
        self.db.commit()

        with patch.object(sach, "SessionLocal", self.session_factory):
            self.assertEqual(sach._lookup_websocket_user(token)["role"], "OFFICIAL")
            self.assertTrue(asyncio.run(
                sach._websocket_session_is_valid(
                    token, "TEST_001", "attendance", upload=False
                )
            ))

            session.revoked_at = sach._utc_now().isoformat()
            self.db.commit()
            self.assertIsNone(sach._lookup_websocket_user(token))
            self.assertFalse(asyncio.run(
                sach._websocket_session_is_valid(
                    token, "TEST_001", "attendance", upload=False
                )
            ))

    def test_live_infrastructure_update_uses_config_without_persisting_audit(self):
        centre = self.db.get(sach.CentreRecord, "TEST_001")
        audit_count = self.db.query(sach.AuditRecord).count()
        original_compliance = centre.compliance_percentage
        original_status = centre.status

        response = sach.submit_live_infrastructure(
            sach.LiveInfrastructureUpdate(
                centre_id="TEST_001",
                detected_computers=5,
                timestamp=sach._utc_now().isoformat(),
            ),
            self.db,
        )

        self.assertEqual(response["live"]["required_computers"], 10)
        self.assertEqual(response["live"]["compliance_percentage"], 50)
        self.assertEqual(response["live"]["status"], "PARTIAL")
        self.assertEqual(self.db.query(sach.AuditRecord).count(), audit_count)
        self.assertEqual(centre.compliance_percentage, original_compliance)
        self.assertEqual(centre.status, original_status)
        self.assertEqual(sach.live_infrastructure["TEST_001"], response["live"])

    def test_dashboard_stats_include_latest_attendance_and_live_infrastructure(self):
        timestamp = sach._utc_now().isoformat()
        sach.log_attendance(
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=6,
                timestamp=timestamp,
            ),
            self.request_for("test-user"),
            self.db,
        )
        sach.submit_live_infrastructure(
            sach.LiveInfrastructureUpdate(
                centre_id="TEST_001",
                detected_computers=5,
                timestamp=timestamp,
            ),
            self.db,
        )

        response = sach.get_dashboard_stats(self.db)

        self.assertEqual(
            response["centres"]["TEST_001"]["live_headcount"],
            6,
        )
        self.assertEqual(
            response["centres"]["TEST_001"]["last_attendance_at"],
            timestamp,
        )
        self.assertEqual(
            response["live_infrastructure"]["TEST_001"]["detected_computers"],
            5,
        )
        self.assertEqual(
            response["live_infrastructure"]["TEST_001"]["compliance_percentage"],
            50,
        )

    def test_live_compliance_uses_each_centres_configured_computer_target(self):
        for centre_id, detected, expected_required, expected_compliance in (
            ("DELHI_001", 9, 15, 60.0),
            ("LUCKNOW_002", 20, 25, 80.0),
            ("MUMBAI_003", 15, 30, 50.0),
        ):
            source = sach.INITIAL_CENTRES[centre_id]
            centre = {
                "required_computers": source["required_computers"],
                "equipment_config": json.loads(source["equipment_config"]),
            }
            with self.subTest(centre_id=centre_id):
                result = sach._live_computer_compliance(centre, detected)
                self.assertEqual(result["required_computers"], expected_required)
                self.assertEqual(
                    result["compliance_percentage"], expected_compliance
                )

    def test_infrastructure_websocket_replaces_client_compliance_with_centre_config(self):
        source = sach.INITIAL_CENTRES["LUCKNOW_002"]
        sach.db_store["centres"]["LUCKNOW_002"] = {
            "required_computers": source["required_computers"],
            "equipment_config": json.loads(source["equipment_config"]),
        }
        message = {
            "frame": "encoded-frame",
            "detected_computers": 20,
            "required_computers": 15,
            "compliance_percentage": 100,
            "status": "COMPLIANT",
        }

        canonical = sach._canonical_live_infrastructure_message(
            "LUCKNOW_002", message
        )

        self.assertEqual(canonical["required_computers"], 25)
        self.assertEqual(canonical["compliance_percentage"], 80.0)
        self.assertEqual(canonical["status"], "COMPLIANT")

    def test_attendance_validation_and_unknown_centre(self):
        with self.assertRaises(ValueError):
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=-1,
            )
        with self.assertRaises(ValueError):
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=5,
                timestamp="not-a-timestamp",
            )
        local_naive = datetime(2026, 10, 20, 11, 0, 0)
        self.assertEqual(
            sach._as_utc_datetime(local_naive).isoformat(),
            "2026-10-20T11:00:00+00:00",
        )
        with self.assertRaises(HTTPException) as raised:
            sach.log_attendance(
                sach.AttendanceLog(
                    centre_id="MISSING",
                    live_headcount=5,
                ),
                self.request_for("test-user"),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 404)

        response = sach.log_attendance(
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=6,
                timestamp="2026-10-12T10:00:00Z",
            ),
            self.request_for("test-user"),
            self.db,
        )
        self.assertEqual(response["status"], "SUCCESS")
        self.assertEqual(self.db.get(sach.CentreRecord, "TEST_001").live_headcount, 6)
        self.assertEqual(
            self.db.scalar(select(sach.AttendanceRecord.live_headcount)),
            6,
        )

    def test_operator_accounts_require_and_are_restricted_to_assigned_centre(self):
        with self.assertRaises(ValueError):
            sach.UserCreateRequest(
                username="centre-op",
                password="correct-horse-battery-staple",
                role="OPERATOR",
            )
        with self.assertRaises(ValueError):
            sach.UserCreateRequest(
                username="not-op",
                password="correct-horse-battery-staple",
                role="OFFICIAL",
                centre_id="TEST_001",
            )

        operator = self.request_for(
            "centre-op",
            role="OPERATOR",
            centre_id="TEST_001",
        )
        result = sach.log_attendance(
            sach.AttendanceLog(centre_id="TEST_001", live_headcount=8),
            operator,
            self.db,
        )
        self.assertEqual(result["status"], "SUCCESS")

        with self.assertRaises(HTTPException) as raised:
            sach.log_attendance(
                sach.AttendanceLog(centre_id="OTHER_001", live_headcount=8),
                operator,
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 403)
        self.assertFalse(sach._role_allowed("GET", "/api/dashboard/stats", "OPERATOR"))
        self.assertTrue(sach._role_allowed("GET", "/api/auth/me", "OPERATOR"))
        self.assertTrue(sach._role_allowed("POST", "/api/attendance/log", "OPERATOR"))
        self.assertFalse(sach._role_allowed("POST", "/api/audit/submit", "OPERATOR"))
        self.assertFalse(sach._role_allowed("POST", "/api/audits/1/archive", "AUDITOR"))
        self.assertTrue(sach._role_allowed("POST", "/api/audits/1/archive", "ADMIN"))

    def test_admin_can_create_operator_account_for_valid_assigned_centre(self):
        request = sach.UserCreateRequest(
            username="centre-op",
            password="correct-horse-battery-staple",
            role="OPERATOR",
            centre_id="TEST_001",
        )
        response = sach.create_user(request, self.db)
        self.assertEqual(response["user"]["role"], "CENTRE_OPERATOR")
        self.assertEqual(response["user"]["centre_id"], "TEST_001")
        login_response = sach.login(
            sach.LoginRequest(
                username="centre-op",
                password="correct-horse-battery-staple",
            ),
            self.db,
        )
        self.assertEqual(login_response["user"]["centre_id"], "TEST_001")
        self.assertEqual(login_response["user"]["role"], "CENTRE_OPERATOR")

        with self.assertRaises(HTTPException) as raised:
            sach.create_user(
                sach.UserCreateRequest(
                    username="invalid-op",
                    password="correct-horse-battery-staple",
                    role="OPERATOR",
                    centre_id="MISSING",
                ),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 404)

    def test_course_roster_and_daily_register_lock_override_audit_workflow(self):
        course = sach.create_course(
            sach.CourseCreateRequest(
                centre_id="TEST_001",
                course_code="EL-A",
                name="Electrician Trade",
                batch_name="Batch A",
            ),
            self.db,
        )["course"]
        for name, roll, face_status, face_id in (
            ("Asha Sharma", "EL001", "REGISTERED", "face-profile-1"),
            ("Ravi Singh", "EL002", "PHOTO_ONBOARDED", None),
            ("Mina Das", "EL003", "PENDING", None),
        ):
            sach.create_roster_student(
                course["id"],
                sach.StudentCreateRequest(
                    student_name=name,
                    roll_number=roll,
                    enrolled_date="2026-08-01",
                    face_profile_id=face_id,
                    face_profile_status=face_status,
                ),
                self.db,
            )

        operator = self.request_for(
            "centre-operator",
            role="CENTRE_OPERATOR",
            centre_id="TEST_001",
        )
        portal = sach.get_operator_portal(operator, self.db)
        self.assertEqual(portal["centre"]["centre_id"], "TEST_001")
        self.assertEqual(portal["courses"][0]["enrollment_count"], 3)
        roster = sach.get_operator_course_roster(course["id"], operator, self.db)
        self.assertEqual(len(roster["students"]), 3)
        self.assertEqual(roster["students"][0]["face_profile_id"], "face-profile-1")

        submitted = sach.submit_operator_attendance_register(
            sach.AttendanceRegisterSubmitRequest(
                course_id=course["id"],
                attendance_date=sach._operator_today().isoformat(),
                marked_present=2,
            ),
            operator,
            self.db,
        )["register"]
        register_id = submitted["id"]
        self.assertEqual(submitted["lock_status"], "SUBMITTED")
        self.assertIsNone(submitted["camera_verified_count"])
        self.assertEqual(len(submitted["history"]), 1)
        self.assertEqual(submitted["history"][0]["source_ip"], "127.0.0.1")
        self.assertTrue(submitted["network_signature"])

        with self.assertRaises(HTTPException) as raised:
            sach.submit_operator_attendance_register(
                sach.AttendanceRegisterSubmitRequest(
                    course_id=course["id"],
                    attendance_date=sach._operator_today().isoformat(),
                    marked_present=2,
                ),
                operator,
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 409)

        edited = sach.edit_operator_attendance_register(
            register_id,
            sach.AttendanceRegisterEditRequest(marked_present=3),
            operator,
            self.db,
        )["register"]
        self.assertEqual(edited["lock_status"], "PERMANENTLY_LOCKED")
        self.assertEqual(edited["edit_count"], 1)
        self.assertEqual(len(edited["history"]), 2)

        with self.assertRaises(HTTPException) as raised:
            sach.edit_operator_attendance_register(
                register_id,
                sach.AttendanceRegisterEditRequest(marked_present=1),
                operator,
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 423)

        unlock_request = sach.request_attendance_unlock(
            register_id,
            sach.AttendanceUnlockRequestBody(
                reason="Correct an entry verified against the signed register"
            ),
            operator,
            self.db,
        )["request"]
        self.assertEqual(unlock_request["status"], "PENDING")
        self.assertEqual(sach._register_lock_status(
            self.db.get(sach.DailyAttendanceRegister, register_id), self.db
        ), "OVERRIDE_REQUESTED")
        inspector = self.request_for("inspector1", role="AUDITOR")
        approved = sach.decide_attendance_unlock_request(
            unlock_request["id"],
            sach.AttendanceUnlockDecisionRequest(
                decision="APPROVE",
                note="Evidence reviewed",
            ),
            inspector,
            self.db,
        )["request"]
        self.assertEqual(approved["status"], "APPROVED")

        corrected = sach.edit_operator_attendance_register(
            register_id,
            sach.AttendanceRegisterEditRequest(marked_present=2),
            operator,
            self.db,
        )["register"]
        self.assertEqual(corrected["lock_status"], "PERMANENTLY_LOCKED")
        self.assertEqual(corrected["history"][-1]["action"], "OVERRIDE_EDITED")
        self.assertEqual(corrected["history"][-1]["actor_username"], "centre-operator")

    def test_admin_can_register_a_centre_and_duplicate_ids_are_rejected(self):
        response = sach.create_admin_centre(
            sach.CentreCreateRequest(
                centre_id=" jaipur_003 ",
                name="Jaipur Skill Centre",
                registered_total=24,
            ),
            self.db,
        )
        self.assertEqual(response["centre"]["centre_id"], "JAIPUR_003")
        self.assertEqual(response["centre"]["registered_total"], 24)
        self.assertEqual(response["centre"]["status"], "NOT_CONFIGURED")
        self.assertIn("JAIPUR_003", sach.db_store["centres"])

        with self.assertRaises(HTTPException) as raised:
            sach.create_admin_centre(
                sach.CentreCreateRequest(
                    centre_id="JAIPUR_003",
                    name="Duplicate Centre",
                ),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertTrue(sach._role_allowed(
            "POST", "/api/admin/centres", "ADMIN"
        ))
        self.assertFalse(sach._role_allowed(
            "POST", "/api/admin/centres", "AUDITOR"
        ))

    def test_operator_api_policy_denies_national_data_and_other_roles_operator_paths(self):
        self.assertTrue(sach._role_allowed("GET", "/api/operator/portal", "CENTRE_OPERATOR"))
        self.assertTrue(sach._role_allowed(
            "POST", "/api/operator/attendance-registers", "CENTRE_OPERATOR"
        ))
        for path in (
            "/api/dashboard/overview",
            "/api/dashboard/stats",
            "/api/alerts",
            "/api/centres",
            "/api/inspector/attendance-registers",
        ):
            self.assertFalse(sach._role_allowed("GET", path, "CENTRE_OPERATOR"))
        self.assertFalse(sach._role_allowed(
            "GET", "/api/operator/portal", "AUDITOR"
        ))
        self.assertTrue(sach._role_allowed(
            "GET", "/api/inspector/attendance-registers", "AUDITOR"
        ))

    def test_register_grace_window_expires_after_thirty_minutes(self):
        course = sach.create_course(
            sach.CourseCreateRequest(
                centre_id="TEST_001",
                course_code="IT-B",
                name="IT Helpdesk",
                batch_name="Batch B",
            ),
            self.db,
        )["course"]
        sach.create_roster_student(
            course["id"],
            sach.StudentCreateRequest(
                student_name="Test Learner",
                roll_number="IT001",
                enrolled_date="2026-08-01",
            ),
            self.db,
        )
        operator = self.request_for(
            "centre-operator",
            role="CENTRE_OPERATOR",
            centre_id="TEST_001",
        )
        submitted = sach.submit_operator_attendance_register(
            sach.AttendanceRegisterSubmitRequest(
                course_id=course["id"],
                attendance_date=sach._operator_today().isoformat(),
                marked_present=1,
            ),
            operator,
            self.db,
        )["register"]
        register = self.db.get(sach.DailyAttendanceRegister, submitted["id"])
        register.submitted_at = (
            sach._utc_now() - sach.timedelta(minutes=30, seconds=1)
        ).isoformat()
        self.db.commit()

        self.assertEqual(sach._register_lock_status(register, self.db), "PERMANENTLY_LOCKED")
        with self.assertRaises(HTTPException) as raised:
            sach.edit_operator_attendance_register(
                register.id,
                sach.AttendanceRegisterEditRequest(marked_present=0),
                operator,
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 423)

    def test_attendance_risk_uses_marked_present_not_registered_total(self):
        centre = {
            "registered_total": 100,
            "official_marked_present": 20,
            "live_headcount": 10,
            "compliance_percentage": 100,
        }

        sach.calculate_centre_risk(centre)

        self.assertEqual(centre["attendance_risk_score"], 50)
        self.assertEqual(centre["fraud_risk_score"], 50)

    def test_full_or_extra_headcount_has_no_attendance_penalty(self):
        for marked_present, detected in ((20, 20), (20, 25), (0, 5)):
            with self.subTest(marked_present=marked_present, detected=detected):
                centre = {
                    "registered_total": 100,
                    "official_marked_present": marked_present,
                    "live_headcount": detected,
                    "compliance_percentage": 100,
                }

                sach.calculate_centre_risk(centre)

                self.assertEqual(centre["attendance_risk_score"], 0)

    def test_dashboard_discrepancy_sums_centre_gaps_without_cross_centre_offset(self):
        self.db.get(sach.CentreRecord, "TEST_001").official_marked_present = 10
        self.db.get(sach.CentreRecord, "TEST_001").live_headcount = 0
        self.db.add(sach.CentreRecord(
            centre_id="TEST_002",
            name="Second Training Centre",
            registered_total=100,
            official_marked_present=20,
            live_headcount=25,
            detected_computers=10,
            required_computers=10,
            compliance_percentage=100,
            fraud_risk_score=0,
            status="SAFE",
        ))
        self.db.commit()

        overview = sach.get_dashboard_overview(self.db)

        self.assertEqual(overview["summary"]["total_attendance_gap"], 10)

    def test_rolling_median_uses_latest_300_samples(self):
        start = sach._utc_now() - sach.timedelta(minutes=10)
        for index in range(300):
            self.db.add(sach.AttendanceRecord(
                centre_id="TEST_001",
                live_headcount=10,
                timestamp=(start + sach.timedelta(seconds=index * 2)).isoformat(),
            ))
        self.db.add(sach.AttendanceRecord(
            centre_id="TEST_001",
            live_headcount=0,
            timestamp=(start + sach.timedelta(seconds=600)).isoformat(),
        ))
        self.db.commit()

        signal = sach.get_attendance_signal(
            self.db,
            "TEST_001",
            expected=10,
            as_of=start + sach.timedelta(seconds=600),
        )

        self.assertEqual(signal["sample_count"], 300)
        self.assertEqual(signal["rolling_median"], 10)
        self.assertFalse(signal["gap_persisted"])

    def test_short_attendance_drop_is_buffered_and_does_not_alert(self):
        start = sach._utc_now() - sach.timedelta(seconds=298)
        for index in range(149):
            self.db.add(sach.AttendanceRecord(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=(start + sach.timedelta(seconds=index * 2)).isoformat(),
            ))
        self.db.flush()
        sample_time = start + sach.timedelta(seconds=298)

        response = sach.log_attendance(
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=sample_time.isoformat(),
            ),
            self.request_for("test-user"),
            self.db,
        )
        updated = response["updated_centre_status"]

        self.assertFalse(updated["attendance_gap_active"])
        self.assertEqual(updated["attendance_gap_duration_seconds"], 298)
        self.assertEqual(updated["attendance_rolling_median"], 0)
        self.assertEqual(updated["attendance_risk_score"], 0)
        self.assertEqual(updated["status"], "SAFE")

        sach._sync_centre_alerts(self.db, as_of=sample_time)
        attendance_alert = self.db.scalar(
            select(sach.AlertRecord).where(
                sach.AlertRecord.centre_id == "TEST_001",
                sach.AlertRecord.alert_type == "ATTENDANCE_GAP",
            )
        )
        self.assertIsNone(attendance_alert)

    def test_attendance_gap_at_exactly_ten_minutes_is_not_yet_alertable(self):
        start = sach._utc_now() - sach.timedelta(seconds=600)
        for index in range(300):
            self.db.add(sach.AttendanceRecord(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=(start + sach.timedelta(seconds=index * 2)).isoformat(),
            ))
        self.db.flush()
        sample_time = start + sach.timedelta(seconds=600)

        response = sach.log_attendance(
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=sample_time.isoformat(),
            ),
            self.request_for("test-user"),
            self.db,
        )

        self.assertEqual(
            response["updated_centre_status"]["attendance_gap_duration_seconds"],
            600,
        )
        self.assertFalse(response["updated_centre_status"]["attendance_gap_active"])
        sach._sync_centre_alerts(self.db, as_of=sample_time)
        self.assertIsNone(self.db.scalar(
            select(sach.AlertRecord).where(
                sach.AlertRecord.centre_id == "TEST_001",
                sach.AlertRecord.alert_type == "ATTENDANCE_GAP",
            )
        ))

    def test_persistent_attendance_gap_raises_risk_and_alert_after_ten_minutes(self):
        start = sach._utc_now() - sach.timedelta(seconds=602)
        for index in range(301):
            self.db.add(sach.AttendanceRecord(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=(start + sach.timedelta(seconds=index * 2)).isoformat(),
            ))
        self.db.flush()
        sample_time = start + sach.timedelta(seconds=602)

        response = sach.log_attendance(
            sach.AttendanceLog(
                centre_id="TEST_001",
                live_headcount=0,
                timestamp=sample_time.isoformat(),
            ),
            self.request_for("test-user"),
            self.db,
        )
        updated = response["updated_centre_status"]

        self.assertTrue(updated["attendance_gap_active"])
        self.assertEqual(updated["attendance_gap_duration_seconds"], 602)
        self.assertEqual(updated["attendance_rolling_median"], 0)
        self.assertEqual(updated["status"], "FLAGGED")

        sach._sync_centre_alerts(self.db, as_of=sample_time)
        attendance_alert = self.db.scalar(
            select(sach.AlertRecord).where(
                sach.AlertRecord.centre_id == "TEST_001",
                sach.AlertRecord.alert_type == "ATTENDANCE_GAP",
                sach.AlertRecord.status == "OPEN",
            )
        )
        self.assertIsNotNone(attendance_alert)

    def test_legacy_audit_validation_and_unknown_centre(self):
        with self.assertRaises(ValueError):
            sach.AuditSubmission(
                centre_id="TEST_001",
                detected_computers=-1,
                required_computers=10,
                compliance_percentage=70,
                status="REVIEW",
            )
        with self.assertRaises(HTTPException) as raised:
            sach.submit_audit(
                sach.AuditSubmission(
                    centre_id="MISSING",
                    detected_computers=5,
                    required_computers=10,
                    compliance_percentage=50,
                    status="REVIEW",
                ),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 404)

        response = sach.submit_audit(
            sach.AuditSubmission(
                centre_id="TEST_001",
                detected_computers=9,
                required_computers=10,
                compliance_percentage=90,
                status="PASS",
            ),
            self.db,
        )
        self.assertEqual(response["status"], "SUCCESS")
        self.assertEqual(
            self.db.get(sach.CentreRecord, "TEST_001").compliance_percentage,
            90,
        )

    def test_dev2_scan_persists_original_and_annotated_evidence(self):
        image_bytes = b"\xff\xd8\xff" + b"test-image-data" * 4
        image = "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode()
        annotated_image = "data:image/jpeg;base64,annotated"
        request = sach.ScanSubmission(
            centre_id="TEST_001",
            base64_images=[image] * 4,
        )
        inference = {
            "model": "equipment_yolo11n_v2.pt",
            "device": "cpu",
            "supported_classes": ["chair", "computer", "desk", "printer", "projector", "whiteboard"],
            "detected": {"computer": 8, "chair": 3},
            "views": [
                {
                    "view": view,
                    "counts": {"computer": 2, "chair": 1},
                    "detections": [{
                        "class_name": "computer",
                        "confidence": 0.91,
                        "bbox": [1.0, 2.0, 3.0, 4.0],
                    }],
                }
                for view in range(1, 5)
            ],
            "annotated_images": [annotated_image] * 4,
        }
        original = self.db.get(sach.CentreRecord, "TEST_001")
        original_metrics = (
            original.detected_computers,
            original.required_computers,
            original.compliance_percentage,
            original.fraud_risk_score,
            original.status,
        )

        with patch.object(sach, "_run_dev2_inference", return_value=inference) as run_inference:
            response = sach.run_infrastructure_scan("TEST_001", request, self.db)
        run_inference.assert_called_once_with(
            [image] * 4,
            {"computer": 10, "chair": 5},
        )
        audit = self.db.scalar(
            select(sach.AuditRecord).where(sach.AuditRecord.centre_id == "TEST_001")
        )
        evidence = sach.get_audit_evidence(audit.id, self.db)
        updated = self.db.get(sach.CentreRecord, "TEST_001")

        self.assertEqual(response["detection_source"], "DEV2_YOLO")
        self.assertFalse(response["authoritative_centre_metrics_updated"])
        self.assertEqual(response["views_captured"], 4)
        self.assertEqual(response["model"], "equipment_yolo11n_v2.pt")
        self.assertEqual(response["detected"], {"computer": 8, "chair": 3})
        self.assertEqual(response["classes"][0]["detected"], 8)
        self.assertEqual(audit.detection_source, "DEV2_YOLO")
        self.assertEqual(evidence["images"], [image] * 4)
        self.assertEqual(evidence["annotated_images"], [annotated_image] * 4)
        self.assertEqual(evidence["results"]["model"], "equipment_yolo11n_v2.pt")
        self.assertEqual(evidence["results"]["views"][0]["detections"][0]["confidence"], 0.91)
        self.assertEqual(
            (
                updated.detected_computers,
                updated.required_computers,
                updated.compliance_percentage,
                updated.fraud_risk_score,
                updated.status,
            ),
            original_metrics,
        )

        with self.assertRaises(HTTPException) as raised:
            sach.get_audit_evidence(9999, self.db)
        self.assertEqual(raised.exception.status_code, 404)

    def test_dev2_failure_does_not_store_a_fake_audit(self):
        image = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xffimage").decode()
        request = sach.ScanSubmission(centre_id="TEST_001", base64_images=[image] * 4)
        with patch.object(
            sach,
            "_run_dev2_inference",
            side_effect=HTTPException(status_code=502, detail="Detector failed"),
        ):
            with self.assertRaises(HTTPException) as raised:
                sach.run_infrastructure_scan("TEST_001", request, self.db)
        self.assertEqual(raised.exception.status_code, 502)
        self.assertIsNone(
            self.db.scalar(
                select(sach.AuditRecord).where(sach.AuditRecord.centre_id == "TEST_001")
            )
        )

    def test_unsupported_dev2_classes_force_review_and_are_not_counted_as_zero(self):
        image = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xffimage").decode()
        inference = {
            "model": "equipment_yolo11n_v2.pt",
            "device": "cpu",
            "supported_classes": ["computer"],
            "detected": {"computer": 10},
            "views": [{"view": index, "counts": {}, "detections": []} for index in range(1, 5)],
            "annotated_images": ["data:image/jpeg;base64,annotated"] * 4,
        }
        with patch.object(sach, "_run_dev2_inference", return_value=inference):
            response = sach.run_infrastructure_scan(
                "TEST_001",
                sach.ScanSubmission(centre_id="TEST_001", base64_images=[image] * 4),
                self.db,
            )
        chair_result = next(item for item in response["classes"] if item["name"] == "chair")
        self.assertIsNone(chair_result["detected"])
        self.assertEqual(response["unsupported_classes"], ["chair"])
        self.assertEqual(response["status"], "REVIEW")

    def test_admin_can_archive_and_restore_scan_record_without_deleting_evidence(self):
        audit = sach.AuditRecord(
            centre_id="TEST_001",
            detected_computers=8,
            required_computers=10,
            compliance_percentage=80,
            status="REVIEW",
            timestamp="2026-10-12T10:00:00+00:00",
            evidence_images=json.dumps(["data:image/jpeg;base64,encoded"]),
            detection_source="SIMULATED",
        )
        self.db.add(audit)
        self.db.commit()

        archived = sach.archive_audit_record(
            audit.id,
            self.request_for("admin-user"),
            self.db,
        )
        self.assertEqual(archived["status"], "ARCHIVED")
        self.assertEqual(audit.archived_by, "admin-user")
        self.assertEqual(sach.get_audit_evidence(audit.id, self.db)["images"], [
            "data:image/jpeg;base64,encoded"
        ])

        restored = sach.restore_audit_record(audit.id, self.db)
        self.assertEqual(restored["status"], "RESTORED")
        self.assertIsNone(audit.archived_at)
        self.assertIsNone(audit.archived_by)

    def test_alert_summary_and_active_filter_match_alert_records(self):
        self.db.add(sach.AlertRecord(
            centre_id="TEST_001",
            alert_type="HISTORICAL",
            severity="MEDIUM",
            title="Resolved alert",
            message="Historical test alert",
            status="RESOLVED",
            created_at="2026-10-11T10:00:00",
            updated_at="2026-10-11T10:00:00",
        ))
        self.db.commit()

        active = sach.list_alerts(
            status="ACTIVE",
            severity=None,
            centre_id=None,
            db=self.db,
        )
        summary = sach.get_alert_summary(self.db)
        overview = sach.get_dashboard_overview(self.db)

        self.assertEqual(active["total"], 1)
        self.assertTrue(all(
            item["status"] in ("OPEN", "ACKNOWLEDGED")
            for item in active["alerts"]
        ))
        self.assertEqual(summary["total_active"], 1)
        self.assertEqual(summary["high"], 1)
        self.assertEqual(summary["resolved"], 1)
        self.assertEqual(overview["alerts"]["total_active"], 1)
        self.assertEqual(overview["alerts"]["high"], 1)
        self.assertEqual(overview["summary"]["high_risk_centres"], 1)

    def test_resolved_alert_cannot_be_acknowledged(self):
        alert = sach.AlertRecord(
            centre_id="TEST_001",
            alert_type="HISTORICAL",
            severity="HIGH",
            title="Resolved alert",
            message="Historical test alert",
            status="RESOLVED",
            created_at="2026-10-11T10:00:00",
            updated_at="2026-10-11T10:00:00",
        )
        self.db.add(alert)
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            sach.acknowledge_alert(
                alert.id,
                sach.AlertAction(actor="Test Inspector"),
                self.request_for("auditor1"),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 409)

    def test_alert_action_actor_comes_from_authenticated_user(self):
        alert = sach.AlertRecord(
            centre_id="TEST_001",
            alert_type="TEST_ALERT",
            severity="HIGH",
            title="Needs review",
            message="Test",
            status="OPEN",
            created_at="2026-10-12T10:00:00",
            updated_at="2026-10-12T10:00:00",
        )
        self.db.add(alert)
        self.db.commit()

        acknowledged = sach.acknowledge_alert(
            alert.id,
            sach.AlertAction(actor="Spoofed Actor"),
            self.request_for("assigned-auditor"),
            self.db,
        )
        self.assertEqual(acknowledged["alert"]["acknowledged_by"], "assigned-auditor")

        resolved = sach.resolve_alert(
            alert.id,
            self.request_for("assigned-auditor"),
            None,
            self.db,
        )
        self.assertEqual(resolved["alert"]["resolved_by"], "assigned-auditor")

    def test_login_uses_hashed_password_and_creates_expiring_session(self):
        password = "correct-horse-battery-staple"
        user = sach.AuthUser(
            username="auditor1",
            password_hash=sach._hash_password(password),
            role="AUDITOR",
            created_at="2026-10-12T10:00:00+00:00",
        )
        self.db.add(user)
        self.db.commit()

        response = sach.login(
            sach.LoginRequest(username="AUDITOR1", password=password),
            self.db,
        )
        stored_session = self.db.scalar(
            select(sach.AuthSession).where(
                sach.AuthSession.user_id == user.id
            )
        )

        self.assertEqual(response["user"]["role"], "AUDITOR")
        self.assertNotEqual(response["access_token"], stored_session.token_hash)
        self.assertEqual(
            stored_session.token_hash,
            sach.hashlib.sha256(response["access_token"].encode()).hexdigest(),
        )
        self.assertTrue(sach._verify_password(password, user.password_hash))
        self.assertFalse(sach._verify_password("wrong-password", user.password_hash))

    def test_role_policy_separates_official_and_auditor_actions(self):
        self.assertTrue(
            sach._role_allowed("POST", "/api/attendance/log", "OFFICIAL")
        )
        self.assertFalse(
            sach._role_allowed("POST", "/api/centres/TEST_001/scan", "OFFICIAL")
        )
        self.assertTrue(
            sach._role_allowed("POST", "/api/centres/TEST_001/scan", "AUDITOR")
        )
        self.assertFalse(
            sach._role_allowed(
                "PUT",
                "/api/centres/TEST_001/equipment-config",
                "AUDITOR",
            )
        )
        self.assertTrue(
            sach._role_allowed(
                "GET",
                "/api/audits/3/evidence",
                "AUDITOR",
            )
        )
        self.assertFalse(
            sach._role_allowed(
                "GET",
                "/api/audits/3/evidence",
                "OFFICIAL",
            )
        )
        self.assertFalse(
            sach._role_allowed("DELETE", "/api/centres/TEST_001", "ADMIN")
        )
        self.assertTrue(
            sach._role_allowed("POST", "/api/audits/3/archive", "ADMIN")
        )
        self.assertFalse(
            sach._role_allowed("POST", "/api/audits/3/archive", "AUDITOR")
        )

    def test_cannot_remove_the_last_active_admin(self):
        admin = sach.AuthUser(
            username="admin1",
            password_hash=sach._hash_password("correct-horse-battery-staple"),
            role="ADMIN",
            created_at="2026-10-12T10:00:00+00:00",
        )
        self.db.add(admin)
        self.db.commit()

        with self.assertRaises(HTTPException) as raised:
            sach.update_user(
                admin.id,
                sach.UserUpdateRequest(is_active=False),
                self.db,
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertTrue(self.db.get(sach.AuthUser, admin.id).is_active)

    def test_auth_middleware_requires_token_and_enforces_role(self):
        async def call_next(_request):
            return Response(status_code=204)

        async def invoke(request):
            with patch.object(sach, "SessionLocal", self.session_factory):
                return await sach.authenticate_api_requests(request, call_next)

        missing = asyncio.run(invoke(
            self.auth_request("GET", "/api/dashboard/stats", "OFFICIAL", False)
        ))
        denied = asyncio.run(invoke(
            self.auth_request("POST", "/api/centres/TEST_001/scan", "OFFICIAL")
        ))
        allowed = asyncio.run(invoke(
            self.auth_request("POST", "/api/attendance/log", "OFFICIAL")
        ))
        operator_national_denied = asyncio.run(invoke(
            self.auth_request("GET", "/api/dashboard/overview", "OPERATOR")
        ))
        operator_portal_allowed = asyncio.run(invoke(
            self.auth_request("GET", "/api/operator/portal", "OPERATOR")
        ))

        self.assertEqual(missing.status_code, 401)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(allowed.status_code, 204)
        self.assertEqual(operator_national_denied.status_code, 403)
        self.assertEqual(operator_portal_allowed.status_code, 204)


if __name__ == "__main__":
    unittest.main()
