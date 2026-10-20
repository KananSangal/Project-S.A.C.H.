from pathlib import Path
from datetime import date, datetime
from datetime import timedelta, timezone
from typing import Optional, Generator, TypedDict
from zoneinfo import ZoneInfo
import asyncio
import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
import statistics
import subprocess

from fastapi import FastAPI, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import create_engine, String, Integer, Float, Text, ForeignKey, UniqueConstraint, select, and_, or_, inspect, text, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session
import csv
import io
import json
from fastapi.responses import StreamingResponse
from fastapi.responses import JSONResponse

# SQLite database lives at backend/sach.db, next to the app/ directory.
BASE_DIR = Path(__file__).resolve().parents[1]
DATABASE_URL = f"sqlite:///{(BASE_DIR / 'sach.db').as_posix()}"
OPERATOR_LOCAL_TIMEZONE = ZoneInfo(
    os.getenv("SACH_OPERATOR_TIMEZONE", "Asia/Kolkata")
)


def _operator_today() -> date:
    return datetime.now(OPERATOR_LOCAL_TIMEZONE).date()

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Base(DeclarativeBase):
    pass


class CentreRecord(Base):
    __tablename__ = "centres"

    centre_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    registered_total: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    official_marked_present: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    live_headcount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    detected_computers: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    required_computers: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    compliance_percentage: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    attendance_risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fraud_risk_score: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="SAFE", nullable=False)
    equipment_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attendance_logs: Mapped[list["AttendanceRecord"]] = relationship(back_populates="centre", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditRecord"]] = relationship(back_populates="centre", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    __tablename__ = "attendance_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    centre_id: Mapped[str] = mapped_column(ForeignKey("centres.centre_id"), index=True)
    live_headcount: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[str] = mapped_column(String(80), nullable=False)
    centre: Mapped[CentreRecord] = relationship(back_populates="attendance_logs")


class AuditRecord(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    centre_id: Mapped[str] = mapped_column(ForeignKey("centres.centre_id"), index=True)
    detected_computers: Mapped[int] = mapped_column(Integer, nullable=False)
    required_computers: Mapped[int] = mapped_column(Integer, nullable=False)
    compliance_percentage: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[str] = mapped_column(String(80), nullable=False)
    evidence_image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # base64 encoded image
    evidence_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    annotated_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    equipment_results: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detection_source: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    archived_at: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    archived_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    centre: Mapped[CentreRecord] = relationship(back_populates="audit_logs")


class CourseRecord(Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("centre_id", "course_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    centre_id: Mapped[str] = mapped_column(ForeignKey("centres.centre_id"), index=True)
    course_code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    batch_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[str] = mapped_column(String(80), nullable=False)


class StudentRosterRecord(Base):
    __tablename__ = "student_roster"
    __table_args__ = (UniqueConstraint("course_id", "roll_number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    student_name: Mapped[str] = mapped_column(String(255), nullable=False)
    roll_number: Mapped[str] = mapped_column(String(80), nullable=False)
    enrolled_date: Mapped[str] = mapped_column(String(10), nullable=False)
    face_profile_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    face_profile_status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class DailyAttendanceRegister(Base):
    __tablename__ = "daily_attendance_registers"
    __table_args__ = (UniqueConstraint("course_id", "attendance_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    centre_id: Mapped[str] = mapped_column(ForeignKey("centres.centre_id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    attendance_date: Mapped[str] = mapped_column(String(10), nullable=False)
    expected_count: Mapped[int] = mapped_column(Integer, nullable=False)
    marked_present: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_by: Mapped[str] = mapped_column(String(64), nullable=False)
    submitted_at: Mapped[str] = mapped_column(String(80), nullable=False)
    edit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    override_granted_at: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    override_granted_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    override_used_at: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    source_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    network_signature: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class AttendanceRegisterHistory(Base):
    __tablename__ = "attendance_register_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("daily_attendance_registers.id"), index=True
    )
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    previous_marked_present: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    marked_present: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_username: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[str] = mapped_column(String(80), nullable=False)
    source_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    network_signature: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class AttendanceUnlockRequest(Base):
    __tablename__ = "attendance_unlock_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    register_id: Mapped[int] = mapped_column(
        ForeignKey("daily_attendance_registers.id"), index=True
    )
    requested_by: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    requested_at: Mapped[str] = mapped_column(String(80), nullable=False)
    source_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    network_signature: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    decided_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    decided_at: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


app = FastAPI(
    title="MSDE PS 245 - SACH (Smart Attendance & Compliance Hub)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "SACH_ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[tuple[str, str], set[WebSocket]] = {}
        self.latest_frames: dict[tuple[str, str], dict] = {}

    async def connect(
        self,
        websocket: WebSocket,
        centre_id: str,
        stream_type: str,
        already_accepted: bool = False,
    ):
        if not already_accepted:
            await websocket.accept()
        key = (centre_id, stream_type)
        self.active_connections.setdefault(key, set()).add(websocket)
        latest_frame = self.latest_frames.get(key)
        if latest_frame is not None:
            await websocket.send_json(latest_frame)

    def disconnect(self, websocket: WebSocket, centre_id: str, stream_type: str):
        key = (centre_id, stream_type)
        connections = self.active_connections.get(key)
        if connections is None:
            return
        connections.discard(websocket)
        if not connections:
            self.active_connections.pop(key, None)

    async def broadcast(self, centre_id: str, stream_type: str, message: dict):
        key = (centre_id, stream_type)
        message = {
            **message,
            "centre_id": centre_id,
            "stream_type": stream_type,
            "received_at": _utc_now().isoformat(),
        }
        self.latest_frames[key] = message
        connections = self.active_connections.get(key, set()).copy()
        if not connections:
            return

        results = await asyncio.gather(
            *(
                asyncio.wait_for(connection.send_json(message), timeout=2)
                for connection in connections
            ),
            return_exceptions=True,
        )
        for connection, result in zip(connections, results):
            if isinstance(result, Exception):
                logger.warning(
                    "Dropping live-feed WebSocket for %s/%s: %s",
                    centre_id,
                    stream_type,
                    result,
                )
                self.disconnect(connection, centre_id, stream_type)


connection_manager = ConnectionManager()


def _lookup_websocket_user(token: str) -> Optional[dict]:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as db:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        )
        user = db.get(AuthUser, session.user_id) if session else None
        if (
            session is None
            or user is None
            or not user.is_active
            or session.revoked_at is not None
        ):
            return None
        expires_at = datetime.fromisoformat(session.expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= _utc_now():
            return None
        return _user_to_dict(user)


def _websocket_role_allowed(
    user: dict,
    centre_id: str,
    stream_type: str,
    upload: bool,
) -> bool:
    if stream_type not in {"attendance", "infra"}:
        return False
    role = user.get("role")
    if upload:
        api_path = (
            "/api/attendance/log"
            if stream_type == "attendance"
            else "/api/audit/live"
        )
        if not _role_allowed("POST", api_path, role):
            return False
    elif role not in AUTH_ROLES:
        return False
    return not _is_operator_role(role) or user.get("centre_id") == centre_id


async def _authenticate_websocket(
    websocket: WebSocket,
    centre_id: str,
    stream_type: str,
    upload: bool,
) -> Optional[str]:
    await websocket.accept()
    try:
        credentials = await asyncio.wait_for(websocket.receive_json(), timeout=5)
        token = credentials.get("token") if isinstance(credentials, dict) else None
        if not isinstance(token, str) or not token:
            raise ValueError("Missing bearer token")
        user = await asyncio.to_thread(_lookup_websocket_user, token)
        if user is None or not _websocket_role_allowed(
            user, centre_id, stream_type, upload
        ):
            raise ValueError("Invalid or unauthorized session")
        await websocket.send_json({"type": "authenticated"})
        return token
    except (asyncio.TimeoutError, ValueError, WebSocketDisconnect):
        await websocket.close(code=1008, reason="Authentication required")
        return None


async def _websocket_session_is_valid(
    token: str,
    centre_id: str,
    stream_type: str,
    upload: bool,
) -> bool:
    user = await asyncio.to_thread(_lookup_websocket_user, token)
    return user is not None and _websocket_role_allowed(
        user, centre_id, stream_type, upload
    )


@app.websocket("/ws/stream_upload/{centre_id}/{stream_type}")
async def stream_upload(websocket: WebSocket, centre_id: str, stream_type: str):
    token = await _authenticate_websocket(
        websocket, centre_id, stream_type, upload=True
    )
    if token is None:
        return
    validation_due = asyncio.get_running_loop().time() + 60
    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_json(), timeout=60
                )
            except asyncio.TimeoutError:
                if not await _websocket_session_is_valid(
                    token, centre_id, stream_type, upload=True
                ):
                    await websocket.close(code=1008, reason="Session expired")
                    return
                validation_due = asyncio.get_running_loop().time() + 60
                continue
            if asyncio.get_running_loop().time() >= validation_due:
                if not await _websocket_session_is_valid(
                    token, centre_id, stream_type, upload=True
                ):
                    await websocket.close(code=1008, reason="Session expired")
                    return
                validation_due = asyncio.get_running_loop().time() + 60
            if (
                not isinstance(message, dict)
                or not isinstance(message.get("frame"), str)
                or not message["frame"]
            ):
                await websocket.close(code=1003, reason="Expected a base64 frame")
                return
            if stream_type == "infra":
                if not _infra_frame_matches_source(centre_id, message):
                    await websocket.close(
                        code=1008,
                        reason="Infrastructure frames must come from this centre's attendance feed",
                    )
                    return
                message = _canonical_live_infrastructure_message(
                    centre_id, message
                )
            await connection_manager.broadcast(centre_id, stream_type, message)
    except WebSocketDisconnect:
        return
    except ValueError:
        await websocket.close(code=1003, reason="Invalid JSON frame")


@app.websocket("/ws/live_feed/{centre_id}/{stream_type}")
async def live_feed(websocket: WebSocket, centre_id: str, stream_type: str):
    token = await _authenticate_websocket(
        websocket, centre_id, stream_type, upload=False
    )
    if token is None:
        return
    await connection_manager.connect(
        websocket, centre_id, stream_type, already_accepted=True
    )
    validation_due = asyncio.get_running_loop().time() + 60
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                pass
            if asyncio.get_running_loop().time() >= validation_due:
                if not await _websocket_session_is_valid(
                    token, centre_id, stream_type, upload=False
                ):
                    await websocket.close(code=1008, reason="Session expired")
                    return
                validation_due = asyncio.get_running_loop().time() + 60
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect(websocket, centre_id, stream_type)


AUTH_TOKEN_LIFETIME = timedelta(hours=8)
AUTH_ROLES = {"ADMIN", "OFFICIAL", "AUDITOR", "OPERATOR", "CENTRE_OPERATOR"}
OPERATOR_ROLES = {"OPERATOR", "CENTRE_OPERATOR"}


def _is_operator_role(role: Optional[str]) -> bool:
    return role in OPERATOR_ROLES


class AuthUser(Base):
    __tablename__ = "auth_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    centre_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("centres.centre_id"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[str] = mapped_column(String(80), nullable=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("auth_users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    revoked_at: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

db_store = {
    "attendance_logs": [],
    "audit_logs": [],
    "centres": {},
}
live_infrastructure: dict[str, dict] = {}


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9_.-]{3,64}", normalized):
            raise ValueError("Username may contain lowercase letters, numbers, ., _, and -")
        return normalized


class CourseCreateRequest(BaseModel):
    centre_id: str = Field(min_length=1, max_length=100)
    course_code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    batch_name: str = Field(min_length=1, max_length=120)

    @field_validator("centre_id", "course_code", "name", "batch_name")
    @classmethod
    def strip_course_fields(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be blank")
        return normalized


class CentreCreateRequest(BaseModel):
    centre_id: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    registered_total: int = Field(default=0, ge=0, le=100000)

    @field_validator("centre_id")
    @classmethod
    def normalize_centre_id(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,99}", normalized):
            raise ValueError("Centre ID may contain uppercase letters, numbers, _ and -")
        return normalized

    @field_validator("name")
    @classmethod
    def strip_centre_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Centre name cannot be blank")
        return normalized


class StudentCreateRequest(BaseModel):
    student_name: str = Field(min_length=1, max_length=255)
    roll_number: str = Field(min_length=1, max_length=80)
    enrolled_date: str = Field(min_length=10, max_length=10)
    face_profile_id: Optional[str] = Field(default=None, max_length=100)
    face_profile_status: str = "PENDING"

    @field_validator("student_name", "roll_number")
    @classmethod
    def strip_student_fields(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be blank")
        return normalized

    @field_validator("enrolled_date")
    @classmethod
    def validate_enrolled_date(cls, value: str) -> str:
        date.fromisoformat(value)
        return value

    @field_validator("face_profile_status")
    @classmethod
    def validate_face_status(cls, value: str) -> str:
        status = value.strip().upper()
        if status not in {"PENDING", "REGISTERED", "PHOTO_ONBOARDED"}:
            raise ValueError("Face profile status must be PENDING, REGISTERED, or PHOTO_ONBOARDED")
        return status

    @model_validator(mode="after")
    def require_face_profile_id(self):
        if self.face_profile_status == "REGISTERED" and not self.face_profile_id:
            raise ValueError("A registered face profile requires a face_profile_id")
        return self


class AttendanceRegisterSubmitRequest(BaseModel):
    course_id: int = Field(gt=0)
    attendance_date: str
    marked_present: int = Field(ge=0)

    @field_validator("attendance_date")
    @classmethod
    def validate_attendance_date(cls, value: str) -> str:
        parsed = date.fromisoformat(value)
        if parsed != _operator_today():
            raise ValueError("Only today's daily attendance can be submitted")
        return value


class AttendanceRegisterEditRequest(BaseModel):
    marked_present: int = Field(ge=0)


class AttendanceUnlockRequestBody(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 10:
            raise ValueError("Explain the unlock request in at least 10 characters")
        return normalized


class AttendanceUnlockDecisionRequest(BaseModel):
    decision: str
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, value: str) -> str:
        decision = value.strip().upper()
        if decision not in {"APPROVE", "REJECT"}:
            raise ValueError("Decision must be APPROVE or REJECT")
        return decision


class UserCreateRequest(LoginRequest):
    role: str
    centre_id: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        role = value.strip().upper()
        if role not in AUTH_ROLES:
            raise ValueError("role must be ADMIN, OFFICIAL, AUDITOR, or CENTRE_OPERATOR")
        return role

    @field_validator("centre_id")
    @classmethod
    def normalize_centre_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("centre_id cannot be blank")
        return normalized

    @model_validator(mode="after")
    def validate_operator_centre(self):
        if _is_operator_role(self.role) != bool(self.centre_id):
            raise ValueError("Operator accounts require one assigned centre; other roles must not have one")
        return self


class UserUpdateRequest(BaseModel):
    role: Optional[str] = None
    centre_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=12, max_length=128)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        role = value.strip().upper()
        if role not in AUTH_ROLES:
            raise ValueError("role must be ADMIN, OFFICIAL, AUDITOR, or CENTRE_OPERATOR")
        return role

    @field_validator("centre_id")
    @classmethod
    def normalize_centre_id(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("centre_id cannot be blank")
        return normalized

    @model_validator(mode="after")
    def require_update(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one user field to update")
        return self


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def _verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_hex, digest_hex = encoded_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            bytes.fromhex(salt_hex),
            int(iterations_text),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def _user_to_dict(user: AuthUser) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "role": "CENTRE_OPERATOR" if _is_operator_role(user.role) else user.role,
        "centre_id": user.centre_id,
        "is_active": user.is_active,
        "created_at": user.created_at,
    }


def _role_allowed(method: str, path: str, role: str) -> bool:
    is_operator = _is_operator_role(role)
    if method in {"GET", "HEAD"}:
        if is_operator:
            return (
                path in {
                    "/api/auth/me",
                    "/api/operator/portal",
                    "/api/operator/attendance-registers",
                }
                or re.fullmatch(r"/api/operator/courses/\d+/roster", path) is not None
            )
        if path.startswith("/api/operator/"):
            return False
        if path.startswith("/api/admin/"):
            return role == "ADMIN"
        if path.startswith("/api/admin/"):
            return role == "ADMIN"
        if path.startswith("/api/inspector/"):
            return role in {"ADMIN", "AUDITOR"}
        if re.fullmatch(r"/api/audits/\d+/evidence", path):
            return role in {"ADMIN", "AUDITOR"}
        if path == "/api/auth/users":
            return role == "ADMIN"
        return True

    if method == "POST" and path == "/api/auth/logout":
        return True
    if method == "POST" and path in {
        "/api/attendance/log",
        "/api/audit/submit",
        "/api/audit/live",
    }:
        return role in {"ADMIN", "OFFICIAL"} | OPERATOR_ROLES and (
            path == "/api/attendance/log" or not is_operator
        )
    if method == "POST" and path in {
        "/api/operator/attendance-registers",
    }:
        return is_operator
    if method == "PUT" and re.fullmatch(
        r"/api/operator/attendance-registers/\d+", path
    ):
        return is_operator
    if method == "POST" and re.fullmatch(
        r"/api/operator/attendance-registers/\d+/override-requests", path
    ):
        return is_operator
    if path.startswith("/api/operator/"):
        return False
    if path.startswith("/api/inspector/"):
        if method == "POST" and re.fullmatch(
            r"/api/inspector/override-requests/\d+/decision", path
        ):
            return role in {"ADMIN", "AUDITOR"}
        if method in {"POST", "PUT", "PATCH", "DELETE"} and path.startswith(
            "/api/inspector/"
        ):
            return role in {"ADMIN", "AUDITOR"}
        return False
    if method == "POST" and path in {
        "/api/admin/courses",
        "/api/admin/centres",
    }:
        return role == "ADMIN"
    if method == "POST" and re.fullmatch(
        r"/api/admin/courses/\d+/students", path
    ):
        return role == "ADMIN"
    if method == "PUT" and re.fullmatch(
        r"/api/centres/[^/]+/equipment-config", path
    ):
        return role == "ADMIN"
    if method == "POST" and re.fullmatch(r"/api/centres/[^/]+/scan", path):
        return role in {"ADMIN", "AUDITOR"}
    if method == "POST" and re.fullmatch(
        r"/api/alerts/\d+/(acknowledge|resolve)", path
    ):
        return role in {"ADMIN", "AUDITOR"}
    if method == "POST" and re.fullmatch(
        r"/api/audits/\d+/(archive|restore)", path
    ):
        return role == "ADMIN"
    if method == "POST" and path == "/api/auth/users":
        return role == "ADMIN"
    if method == "PATCH" and re.fullmatch(r"/api/auth/users/\d+", path):
        return role == "ADMIN"
    return False


@app.middleware("http")
async def authenticate_api_requests(request: Request, call_next):
    path = request.url.path
    if (
        not path.startswith("/api/")
        or request.method == "OPTIONS"
        or path in {"/api/auth/login", "/api/auth/bootstrap-status"}
    ):
        return await call_next(request)

    authorization = request.headers.get("authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token:
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with SessionLocal() as db:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == token_hash)
        )
        user = db.get(AuthUser, session.user_id) if session else None
        now = _utc_now()
        if (
            session is None
            or user is None
            or not user.is_active
            or session.revoked_at is not None
            or datetime.fromisoformat(session.expires_at) <= now
        ):
            return JSONResponse(
                status_code=401,
                content={"detail": "Authentication required"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not _role_allowed(request.method, path, user.role):
            return JSONResponse(
                status_code=403,
                content={"detail": "Your role is not permitted to perform this action"},
            )
        request.state.auth_user = _user_to_dict(user)
        request.state.auth_token_hash = token_hash

    return await call_next(request)


@app.get("/api/auth/bootstrap-status")
def get_auth_bootstrap_status(db: Session = Depends(get_db)):
    admin_exists = db.scalar(
        select(AuthUser.id).where(
            AuthUser.role == "ADMIN",
            AuthUser.is_active.is_(True),
        ).limit(1)
    ) is not None
    return {
        "admin_configured": admin_exists or bool(
            os.getenv("SACH_BOOTSTRAP_ADMIN_USERNAME")
            and os.getenv("SACH_BOOTSTRAP_ADMIN_PASSWORD")
        ),
    }


@app.post("/api/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(
        select(AuthUser).where(AuthUser.username == data.username)
    )
    now = _utc_now()
    if user is None:
        _verify_password(data.password, _hash_password("invalid-login-password"))
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if user.locked_until and datetime.fromisoformat(user.locked_until) > now:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts; try again later",
        )

    if not user.is_active or not _verify_password(data.password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= 5:
            user.locked_until = (now + timedelta(minutes=15)).isoformat()
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user.failed_login_attempts = 0
    user.locked_until = None
    token = secrets.token_urlsafe(32)
    expires_at = now + AUTH_TOKEN_LIFETIME
    db.add(AuthSession(
        user_id=user.id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=expires_at.isoformat(),
    ))
    db.commit()
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at.isoformat(),
        "user": _user_to_dict(user),
    }


@app.get("/api/auth/me")
def get_current_user(request: Request):
    return request.state.auth_user


def _request_network_signature(request: Request) -> tuple[Optional[str], Optional[str]]:
    source_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")
    if source_ip is None:
        return None, None
    signature = hashlib.sha256(
        f"{source_ip}|{user_agent}".encode("utf-8")
    ).hexdigest()
    return source_ip, signature


def _course_to_dict(course: CourseRecord, db: Session) -> dict:
    enrollment = db.scalar(
        select(func.count(StudentRosterRecord.id))
        .where(
            StudentRosterRecord.course_id == course.id,
            StudentRosterRecord.is_active.is_(True),
        )
    )
    return {
        "id": course.id,
        "centre_id": course.centre_id,
        "course_code": course.course_code,
        "name": course.name,
        "batch_name": course.batch_name,
        "is_active": course.is_active,
        "enrollment_count": enrollment or 0,
    }


def _register_lock_status(register: DailyAttendanceRegister, db: Session) -> str:
    pending_override = db.scalar(
        select(AttendanceUnlockRequest.id).where(
            AttendanceUnlockRequest.register_id == register.id,
            AttendanceUnlockRequest.status == "PENDING",
        ).limit(1)
    )
    if pending_override is not None:
        return "OVERRIDE_REQUESTED"
    if register.override_granted_at and not register.override_used_at:
        return "OVERRIDE_APPROVED"
    submitted_at = datetime.fromisoformat(register.submitted_at)
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    if (
        register.edit_count >= 1
        or _utc_now() >= submitted_at + timedelta(minutes=30)
    ):
        return "PERMANENTLY_LOCKED"
    return "SUBMITTED"


def _register_to_dict(register: DailyAttendanceRegister, db: Session) -> dict:
    course = db.get(CourseRecord, register.course_id)
    history = db.scalars(
        select(AttendanceRegisterHistory)
        .where(AttendanceRegisterHistory.register_id == register.id)
        .order_by(AttendanceRegisterHistory.id)
    ).all()
    return {
        "id": register.id,
        "centre_id": register.centre_id,
        "course_id": register.course_id,
        "course_name": course.name if course else "Unknown course",
        "course_code": course.course_code if course else "",
        "batch_name": course.batch_name if course else "",
        "attendance_date": register.attendance_date,
        "expected_count": register.expected_count,
        "marked_present": register.marked_present,
        "camera_verified_count": None,
        "attendance_percentage": (
            round(register.marked_present / register.expected_count * 100, 1)
            if register.expected_count > 0
            else 0.0
        ),
        "submitted_by": register.submitted_by,
        "submitted_at": register.submitted_at,
        "edit_count": register.edit_count,
        "lock_status": _register_lock_status(register, db),
        "override_granted_by": register.override_granted_by,
        "override_used_at": register.override_used_at,
        "network_signature": register.network_signature,
        "history": [
            {
                "action": item.action,
                "previous_marked_present": item.previous_marked_present,
                "marked_present": item.marked_present,
                "actor_username": item.actor_username,
                "occurred_at": item.occurred_at,
                "source_ip": item.source_ip,
                "network_signature": item.network_signature,
            }
            for item in history
        ],
    }


def _require_operator_centre(
    request: Request,
    course: CourseRecord,
    db: Session,
) -> None:
    auth_user = request.state.auth_user
    if _is_operator_role(auth_user.get("role")):
        if course.centre_id != auth_user.get("centre_id"):
            raise HTTPException(status_code=404, detail="Course not found")
    elif auth_user.get("role") not in {"ADMIN", "AUDITOR"}:
        raise HTTPException(status_code=403, detail="Access denied")
    if db.get(CentreRecord, course.centre_id) is None:
        raise HTTPException(status_code=404, detail="Centre not found")


@app.get("/api/operator/portal")
def get_operator_portal(request: Request, db: Session = Depends(get_db)):
    auth_user = request.state.auth_user
    if not _is_operator_role(auth_user.get("role")):
        raise HTTPException(status_code=403, detail="Centre Operator role required")
    centre_id = auth_user.get("centre_id")
    centre = db.get(CentreRecord, centre_id) if centre_id else None
    if centre is None:
        raise HTTPException(status_code=403, detail="Operator account has no valid assigned centre")
    courses = db.scalars(
        select(CourseRecord)
        .where(CourseRecord.centre_id == centre_id, CourseRecord.is_active.is_(True))
        .order_by(CourseRecord.name, CourseRecord.batch_name)
    ).all()
    return {
        "centre": {"centre_id": centre.centre_id, "name": centre.name},
        "courses": [_course_to_dict(course, db) for course in courses],
        "server_date": _operator_today().isoformat(),
    }


@app.get("/api/operator/courses/{course_id}/roster")
def get_operator_course_roster(
    course_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    course = db.get(CourseRecord, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    _require_operator_centre(request, course, db)
    students = db.scalars(
        select(StudentRosterRecord)
        .where(
            StudentRosterRecord.course_id == course.id,
            StudentRosterRecord.is_active.is_(True),
        )
        .order_by(StudentRosterRecord.roll_number)
    ).all()
    return {
        "course": _course_to_dict(course, db),
        "students": [
            {
                "student_name": student.student_name,
                "roll_number": student.roll_number,
                "enrolled_date": student.enrolled_date,
                "face_profile_id": student.face_profile_id,
                "face_profile_status": student.face_profile_status,
            }
            for student in students
        ],
    }


@app.get("/api/operator/attendance-registers")
def list_operator_attendance_registers(
    request: Request,
    course_id: Optional[int] = Query(default=None, gt=0),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    centre_id = request.state.auth_user.get("centre_id")
    statement = select(DailyAttendanceRegister).where(
        DailyAttendanceRegister.centre_id == centre_id
    )
    if course_id is not None:
        course = db.get(CourseRecord, course_id)
        if course is None or course.centre_id != centre_id:
            raise HTTPException(status_code=404, detail="Course not found")
        statement = statement.where(DailyAttendanceRegister.course_id == course_id)
    if month:
        try:
            month_start = date.fromisoformat(f"{month}-01")
        except ValueError as error:
            raise HTTPException(status_code=422, detail="month must use YYYY-MM format") from error
        next_month = date(
            month_start.year + (month_start.month == 12),
            1 if month_start.month == 12 else month_start.month + 1,
            1,
        )
        statement = statement.where(
            DailyAttendanceRegister.attendance_date >= month_start.isoformat(),
            DailyAttendanceRegister.attendance_date < next_month.isoformat(),
        )
    registers = db.scalars(
        statement.order_by(DailyAttendanceRegister.attendance_date.desc())
    ).all()
    return {"registers": [_register_to_dict(register, db) for register in registers]}


@app.post("/api/operator/attendance-registers", status_code=201)
def submit_operator_attendance_register(
    data: AttendanceRegisterSubmitRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    course = db.get(CourseRecord, data.course_id)
    if course is None or not course.is_active:
        raise HTTPException(status_code=404, detail="Active course not found")
    _require_operator_centre(request, course, db)
    expected_count = db.scalar(
        select(func.count(StudentRosterRecord.id)).where(
            StudentRosterRecord.course_id == course.id,
            StudentRosterRecord.is_active.is_(True),
        )
    ) or 0
    if data.marked_present > expected_count:
        raise HTTPException(
            status_code=422,
            detail=f"Marked-present count cannot exceed course enrollment ({expected_count})",
        )
    submitted_at = _utc_now().isoformat()
    source_ip, network_signature = _request_network_signature(request)
    register = DailyAttendanceRegister(
        centre_id=course.centre_id,
        course_id=course.id,
        attendance_date=data.attendance_date,
        expected_count=expected_count,
        marked_present=data.marked_present,
        submitted_by=request.state.auth_user["username"],
        submitted_at=submitted_at,
        source_ip=source_ip,
        network_signature=network_signature,
    )
    db.add(register)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Attendance for this course and date has already been submitted",
        ) from error
    db.add(AttendanceRegisterHistory(
        register_id=register.id,
        action="SUBMITTED",
        previous_marked_present=None,
        marked_present=data.marked_present,
        actor_username=request.state.auth_user["username"],
        occurred_at=submitted_at,
        source_ip=source_ip,
        network_signature=network_signature,
    ))
    db.commit()
    db.refresh(register)
    return {"register": _register_to_dict(register, db)}


@app.put("/api/operator/attendance-registers/{register_id}")
def edit_operator_attendance_register(
    register_id: int,
    data: AttendanceRegisterEditRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    register = db.get(DailyAttendanceRegister, register_id)
    if register is None:
        raise HTTPException(status_code=404, detail="Attendance register not found")
    course = db.get(CourseRecord, register.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    _require_operator_centre(request, course, db)
    if data.marked_present > register.expected_count:
        raise HTTPException(
            status_code=422,
            detail=f"Marked-present count cannot exceed submitted enrollment ({register.expected_count})",
        )
    now = _utc_now()
    submitted_at = datetime.fromisoformat(register.submitted_at)
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    within_grace = now < submitted_at + timedelta(minutes=30)
    regular_edit_allowed = within_grace and register.edit_count == 0
    override_edit_allowed = (
        register.override_granted_at is not None
        and register.override_used_at is None
    )
    if not regular_edit_allowed and not override_edit_allowed:
        raise HTTPException(
            status_code=423,
            detail="Attendance is permanently locked; an Inspector override approval is required",
        )
    previous_count = register.marked_present
    if override_edit_allowed:
        result = db.execute(
            update(DailyAttendanceRegister)
            .where(
                DailyAttendanceRegister.id == register.id,
                DailyAttendanceRegister.override_granted_at.is_not(None),
                DailyAttendanceRegister.override_used_at.is_(None),
            )
            .values(
                marked_present=data.marked_present,
                edit_count=DailyAttendanceRegister.edit_count + 1,
                override_used_at=now.isoformat(),
            )
        )
        history_action = "OVERRIDE_EDITED"
    else:
        grace_deadline_floor = (now - timedelta(minutes=30)).isoformat()
        result = db.execute(
            update(DailyAttendanceRegister)
            .where(
                DailyAttendanceRegister.id == register.id,
                DailyAttendanceRegister.edit_count == 0,
                DailyAttendanceRegister.submitted_at > grace_deadline_floor,
                DailyAttendanceRegister.override_granted_at.is_(None),
            )
            .values(
                marked_present=data.marked_present,
                edit_count=DailyAttendanceRegister.edit_count + 1,
            )
        )
        history_action = "EDITED"
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=423,
            detail="Attendance is permanently locked; an Inspector override approval is required",
        )
    source_ip, network_signature = _request_network_signature(request)
    db.add(AttendanceRegisterHistory(
        register_id=register.id,
        action=history_action,
        previous_marked_present=previous_count,
        marked_present=data.marked_present,
        actor_username=request.state.auth_user["username"],
        occurred_at=now.isoformat(),
        source_ip=source_ip,
        network_signature=network_signature,
    ))
    db.commit()
    db.expire(register)
    db.refresh(register)
    return {"register": _register_to_dict(register, db)}


@app.post("/api/operator/attendance-registers/{register_id}/override-requests", status_code=201)
def request_attendance_unlock(
    register_id: int,
    data: AttendanceUnlockRequestBody,
    request: Request,
    db: Session = Depends(get_db),
):
    register = db.get(DailyAttendanceRegister, register_id)
    if register is None:
        raise HTTPException(status_code=404, detail="Attendance register not found")
    course = db.get(CourseRecord, register.course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    _require_operator_centre(request, course, db)
    if _register_lock_status(register, db) != "PERMANENTLY_LOCKED":
        raise HTTPException(status_code=409, detail="Register is not locked")
    existing_pending = db.scalar(
        select(AttendanceUnlockRequest.id).where(
            AttendanceUnlockRequest.register_id == register.id,
            AttendanceUnlockRequest.status == "PENDING",
        ).limit(1)
    )
    if existing_pending is not None:
        raise HTTPException(status_code=409, detail="An unlock request is already pending")
    source_ip, network_signature = _request_network_signature(request)
    unlock_request = AttendanceUnlockRequest(
        register_id=register.id,
        requested_by=request.state.auth_user["username"],
        reason=data.reason,
        requested_at=_utc_now().isoformat(),
        source_ip=source_ip,
        network_signature=network_signature,
    )
    db.add(unlock_request)
    db.commit()
    db.refresh(unlock_request)
    return {"request": _unlock_request_to_dict(unlock_request, db)}


def _unlock_request_to_dict(
    unlock_request: AttendanceUnlockRequest,
    db: Session,
) -> dict:
    register = db.get(DailyAttendanceRegister, unlock_request.register_id)
    course = db.get(CourseRecord, register.course_id) if register else None
    centre = db.get(CentreRecord, register.centre_id) if register else None
    return {
        "id": unlock_request.id,
        "register_id": unlock_request.register_id,
        "centre_id": register.centre_id if register else None,
        "centre_name": centre.name if centre else "Unknown centre",
        "course_name": course.name if course else "Unknown course",
        "batch_name": course.batch_name if course else "",
        "attendance_date": register.attendance_date if register else None,
        "marked_present": register.marked_present if register else None,
        "requested_by": unlock_request.requested_by,
        "reason": unlock_request.reason,
        "requested_at": unlock_request.requested_at,
        "source_ip": unlock_request.source_ip,
        "network_signature": unlock_request.network_signature,
        "status": unlock_request.status,
        "decided_by": unlock_request.decided_by,
        "decided_at": unlock_request.decided_at,
        "decision_note": unlock_request.decision_note,
    }


@app.get("/api/inspector/attendance-registers")
def list_inspector_attendance_registers(
    centre_id: Optional[str] = Query(default=None),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    statement = select(DailyAttendanceRegister)
    if centre_id:
        statement = statement.where(DailyAttendanceRegister.centre_id == centre_id)
    if month:
        try:
            month_start = date.fromisoformat(f"{month}-01")
        except ValueError as error:
            raise HTTPException(status_code=422, detail="month must use YYYY-MM format") from error
        next_month = date(
            month_start.year + (month_start.month == 12),
            1 if month_start.month == 12 else month_start.month + 1,
            1,
        )
        statement = statement.where(
            DailyAttendanceRegister.attendance_date >= month_start.isoformat(),
            DailyAttendanceRegister.attendance_date < next_month.isoformat(),
        )
    registers = db.scalars(
        statement.order_by(DailyAttendanceRegister.submitted_at.desc())
    ).all()
    return {"registers": [_register_to_dict(register, db) for register in registers]}


@app.get("/api/inspector/override-requests")
def list_inspector_override_requests(
    status: str = Query(default="PENDING", pattern=r"^(PENDING|APPROVED|REJECTED)$"),
    db: Session = Depends(get_db),
):
    requests = db.scalars(
        select(AttendanceUnlockRequest)
        .where(AttendanceUnlockRequest.status == status)
        .order_by(AttendanceUnlockRequest.requested_at.desc())
    ).all()
    return {"requests": [_unlock_request_to_dict(item, db) for item in requests]}


@app.post("/api/inspector/override-requests/{request_id}/decision")
def decide_attendance_unlock_request(
    request_id: int,
    data: AttendanceUnlockDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    unlock_request = db.get(AttendanceUnlockRequest, request_id)
    if unlock_request is None:
        raise HTTPException(status_code=404, detail="Unlock request not found")
    if unlock_request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Unlock request has already been decided")
    now = _utc_now().isoformat()
    unlock_request.status = "APPROVED" if data.decision == "APPROVE" else "REJECTED"
    unlock_request.decided_by = request.state.auth_user["username"]
    unlock_request.decided_at = now
    unlock_request.decision_note = data.note.strip() if data.note else None
    if data.decision == "APPROVE":
        register = db.get(DailyAttendanceRegister, unlock_request.register_id)
        if register is None:
            raise HTTPException(status_code=404, detail="Attendance register not found")
        register.override_granted_at = now
        register.override_granted_by = request.state.auth_user["username"]
        register.override_used_at = None
    db.commit()
    db.refresh(unlock_request)
    return {"request": _unlock_request_to_dict(unlock_request, db)}


@app.post("/api/admin/centres", status_code=201)
def create_admin_centre(data: CentreCreateRequest, db: Session = Depends(get_db)):
    if db.get(CentreRecord, data.centre_id) is not None:
        raise HTTPException(status_code=409, detail="Centre ID already exists")
    centre = CentreRecord(
        centre_id=data.centre_id,
        name=data.name,
        registered_total=data.registered_total,
        official_marked_present=0,
        live_headcount=0,
        detected_computers=0,
        required_computers=0,
        compliance_percentage=0,
        attendance_risk_score=0,
        fraud_risk_score=0,
        status="NOT_CONFIGURED",
    )
    db.add(centre)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Centre ID already exists") from error
    db.refresh(centre)
    refresh_cache(db)
    return {"centre": centre_to_dict(centre) | {"centre_id": centre.centre_id}}


@app.post("/api/admin/courses", status_code=201)
def create_course(data: CourseCreateRequest, db: Session = Depends(get_db)):
    if db.get(CentreRecord, data.centre_id) is None:
        raise HTTPException(status_code=404, detail="Centre not found")
    course = CourseRecord(
        **data.model_dump(),
        created_at=_utc_now().isoformat(),
    )
    db.add(course)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Course code already exists for this centre",
        ) from error
    db.refresh(course)
    return {"course": _course_to_dict(course, db)}


@app.get("/api/admin/courses")
def list_admin_courses(
    centre_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    statement = select(CourseRecord)
    if centre_id:
        statement = statement.where(CourseRecord.centre_id == centre_id)
    courses = db.scalars(statement.order_by(CourseRecord.centre_id, CourseRecord.name)).all()
    return {"courses": [_course_to_dict(course, db) for course in courses]}


@app.post("/api/admin/courses/{course_id}/students", status_code=201)
def create_roster_student(
    course_id: int,
    data: StudentCreateRequest,
    db: Session = Depends(get_db),
):
    course = db.get(CourseRecord, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    student = StudentRosterRecord(course_id=course.id, **data.model_dump())
    db.add(student)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Roll number already exists in this course",
        ) from error
    db.refresh(student)
    return {
        "student": {
            "student_name": student.student_name,
            "roll_number": student.roll_number,
            "enrolled_date": student.enrolled_date,
            "face_profile_id": student.face_profile_id,
            "face_profile_status": student.face_profile_status,
        }
    }


@app.get("/api/admin/courses/{course_id}/students")
def list_course_students(course_id: int, db: Session = Depends(get_db)):
    course = db.get(CourseRecord, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    students = db.scalars(
        select(StudentRosterRecord)
        .where(
            StudentRosterRecord.course_id == course.id,
            StudentRosterRecord.is_active.is_(True),
        )
        .order_by(StudentRosterRecord.roll_number)
    ).all()
    return {
        "students": [
            {
                "student_name": student.student_name,
                "roll_number": student.roll_number,
                "enrolled_date": student.enrolled_date,
                "face_profile_id": student.face_profile_id,
                "face_profile_status": student.face_profile_status,
            }
            for student in students
        ]
    }


@app.post("/api/auth/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    session = db.scalar(
        select(AuthSession).where(
            AuthSession.token_hash == request.state.auth_token_hash
        )
    )
    if session is not None and session.revoked_at is None:
        session.revoked_at = _utc_now().isoformat()
        db.commit()
    return {"status": "SUCCESS"}


@app.get("/api/auth/users")
def list_users(db: Session = Depends(get_db)):
    users = db.scalars(select(AuthUser).order_by(AuthUser.username)).all()
    return {"users": [_user_to_dict(user) for user in users]}


@app.post("/api/auth/users", status_code=201)
def create_user(data: UserCreateRequest, db: Session = Depends(get_db)):
    if db.scalar(select(AuthUser.id).where(AuthUser.username == data.username)):
        raise HTTPException(status_code=409, detail="Username is already in use")
    if data.centre_id and db.get(CentreRecord, data.centre_id) is None:
        raise HTTPException(status_code=404, detail=f"Centre '{data.centre_id}' not found")
    user = AuthUser(
        username=data.username,
        password_hash=_hash_password(data.password),
        role=data.role,
        centre_id=data.centre_id,
        created_at=_utc_now().isoformat(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"user": _user_to_dict(user)}


@app.patch("/api/auth/users/{user_id}")
def update_user(user_id: int, data: UserUpdateRequest, db: Session = Depends(get_db)):
    user = db.get(AuthUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    new_role = data.role if data.role is not None else user.role
    new_centre_id = (
        data.centre_id
        if "centre_id" in data.model_fields_set
        else user.centre_id
    )
    if _is_operator_role(new_role) and not new_centre_id:
        raise HTTPException(
            status_code=422,
            detail="Operator accounts require one assigned centre",
        )
    if not _is_operator_role(new_role) and new_centre_id:
        raise HTTPException(
            status_code=422,
            detail="Only operator accounts may be assigned a centre",
        )
    if new_centre_id and db.get(CentreRecord, new_centre_id) is None:
        raise HTTPException(status_code=404, detail=f"Centre '{new_centre_id}' not found")
    new_is_active = data.is_active if data.is_active is not None else user.is_active
    loses_admin_access = user.role == "ADMIN" and (
        new_role != "ADMIN" or not new_is_active
    )
    if loses_admin_access:
        active_admin_count = db.scalar(
            select(AuthUser.id).where(
                AuthUser.role == "ADMIN",
                AuthUser.is_active.is_(True),
                AuthUser.id != user.id,
            ).limit(1)
        )
        if active_admin_count is None:
            raise HTTPException(
                status_code=409,
                detail="At least one active administrator must remain",
            )

    access_changed = data.role is not None or new_centre_id != user.centre_id
    if data.role is not None:
        user.role = data.role
    user.centre_id = new_centre_id
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.password is not None:
        user.password_hash = _hash_password(data.password)
        user.failed_login_attempts = 0
        user.locked_until = None
    if data.password is not None or access_changed:
        now = _utc_now().isoformat()
        for session in db.scalars(
            select(AuthSession).where(
                AuthSession.user_id == user.id,
                AuthSession.revoked_at.is_(None),
            )
        ):
            session.revoked_at = now
    db.commit()
    db.refresh(user)
    return {"user": _user_to_dict(user)}


INITIAL_CENTRES = {
    "DELHI_001": {
        "name": "PMKVY Training Centre - North Delhi",
        "registered_total": 15,
        "official_marked_present": 15,
        "live_headcount": 0,
        "detected_computers": 15,
        "required_computers": 15,
        "compliance_percentage": 100.0,
        "fraud_risk_score": 1.3,
        "status": "SAFE",
        "equipment_config": json.dumps({
            "classes": [
                {"name": "computer", "label": "Computers", "required": 15},
                {"name": "chair", "label": "Chairs", "required": 20},
                {"name": "desk", "label": "Desks", "required": 18},
                {"name": "whiteboard", "label": "Whiteboards", "required": 2},
                {"name": "safety_goggles", "label": "Safety Goggles", "required": 15},
            ],
        }),
    },
    "LUCKNOW_002": {
        "name": "NSTI Skill Hub - Lucknow Central",
        "registered_total": 25,
        "official_marked_present": 20,
        "live_headcount": 18,
        "detected_computers": 21,
        "required_computers": 25,
        "compliance_percentage": 84.0,
        "fraud_risk_score": 25.0,
        "status": "WARNING",
        "equipment_config": json.dumps({
            "classes": [
                {"name": "computer", "label": "Computers", "required": 25},
                {"name": "chair", "label": "Chairs", "required": 30},
                {"name": "desk", "label": "Desks", "required": 28},
                {"name": "whiteboard", "label": "Whiteboards", "required": 3},
                {"name": "projector", "label": "Projectors", "required": 2},
            ],
        }),
    },
    "MUMBAI_003": {
        "name": "Jan Shikshan Sansthan - Mumbai East",
        "registered_total": 30,
        "official_marked_present": 28,
        "live_headcount": 3,
        "detected_computers": 12,
        "required_computers": 30,
        "compliance_percentage": 40.0,
        "fraud_risk_score": 92.0,
        "status": "HIGH_RISK",
        "equipment_config": json.dumps({
            "classes": [
                {"name": "computer", "label": "Computers", "required": 30},
                {"name": "chair", "label": "Chairs", "required": 35},
                {"name": "desk", "label": "Desks", "required": 30},
                {"name": "whiteboard", "label": "Whiteboards", "required": 4},
                {"name": "safety_goggles", "label": "Safety Goggles", "required": 30},
                {"name": "welding_tool", "label": "Welding Tools", "required": 8},
            ],
        }),
    },
}


class AttendanceLog(BaseModel):
    centre_id: str = Field(min_length=1, max_length=100)
    live_headcount: int = Field(ge=0, le=10000)
    timestamp: Optional[str] = None

    @field_validator("centre_id")
    @classmethod
    def validate_centre_id(cls, value: str) -> str:
        value = value.strip()
        if not value or value.lower() == "string":
            raise ValueError("A valid centre_id is required")
        return value

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("timestamp must be an ISO-8601 datetime") from error
        return value


class AuditSubmission(BaseModel):
    centre_id: str = Field(min_length=1, max_length=100)
    detected_computers: int = Field(ge=0, le=10000)
    required_computers: int = Field(ge=0, le=10000)
    compliance_percentage: float = Field(ge=0, le=100)
    status: str = Field(min_length=1, max_length=50)
    evidence_image: Optional[str] = None  # base64 encoded evidence image

    @field_validator("centre_id")
    @classmethod
    def validate_centre_id(cls, value: str) -> str:
        value = value.strip()
        if not value or value.lower() == "string":
            raise ValueError("A valid centre_id is required")
        return value


class LiveInfrastructureUpdate(BaseModel):
    centre_id: str = Field(min_length=1, max_length=100)
    detected_computers: int = Field(ge=0, le=10000)
    timestamp: Optional[str] = None

    @field_validator("centre_id")
    @classmethod
    def validate_centre_id(cls, value: str) -> str:
        value = value.strip()
        if not value or value.lower() == "string":
            raise ValueError("A valid centre_id is required")
        return value

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("timestamp must be an ISO-8601 datetime") from error
        return value


class EquipmentClassConfig(BaseModel):
    name: str = Field(min_length=2, max_length=80, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=100)
    required: int = Field(ge=0, le=10000)

    @field_validator("label")
    @classmethod
    def label_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Equipment labels cannot be blank")
        return value


class EquipmentConfig(BaseModel):
    classes: list[EquipmentClassConfig] = Field(min_length=1, max_length=40)

    @field_validator("classes")
    @classmethod
    def class_names_must_be_unique(
        cls, classes: list[EquipmentClassConfig]
    ) -> list[EquipmentClassConfig]:
        names = [item.name for item in classes]
        if len(names) != len(set(names)):
            raise ValueError("Equipment class names must be unique")
        if "computer" not in names:
            raise ValueError("The computer class is required for legacy compliance reporting")
        return classes


ATTENDANCE_SAMPLE_INTERVAL = timedelta(seconds=2)
ATTENDANCE_WINDOW = timedelta(minutes=10)
ATTENDANCE_WINDOW_SAMPLE_LIMIT = 300
ATTENDANCE_GAP_SAMPLE_LIMIT = ATTENDANCE_WINDOW_SAMPLE_LIMIT + 2
ATTENDANCE_GAP_ALERT_THRESHOLD = timedelta(minutes=10)
ATTENDANCE_MAX_SAMPLE_GAP = ATTENDANCE_SAMPLE_INTERVAL * 3


class AttendanceSignal(TypedDict):
    rolling_median: float
    sample_count: int
    gap_duration_seconds: int
    gap_persisted: bool
    gap_started_at: Optional[str]
    risk_headcount: float


def _as_utc_datetime(value: str | datetime) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _calculate_attendance_risk(marked_present: int, headcount: float) -> float:
    if marked_present <= 0:
        return 0.0
    discrepancy = max(0.0, marked_present - headcount)
    return round((discrepancy / marked_present) * 100, 1)


def get_attendance_signal(
    db: Session,
    centre_id: str,
    expected: int,
    as_of: Optional[datetime] = None,
) -> AttendanceSignal:
    reference_time = _as_utc_datetime(as_of or _utc_now())
    window_start = reference_time - ATTENDANCE_WINDOW
    records = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.centre_id == centre_id)
        .order_by(AttendanceRecord.id.desc())
        .limit(ATTENDANCE_GAP_SAMPLE_LIMIT)
    ).all()

    samples = []
    for record in records:
        sample_time = _as_utc_datetime(record.timestamp)
        if sample_time <= reference_time:
            samples.append((sample_time, record.live_headcount))
    samples.sort(key=lambda sample: sample[0])

    window_samples = [sample for sample in samples if sample[0] >= window_start]
    median_samples = window_samples[-ATTENDANCE_WINDOW_SAMPLE_LIMIT:]
    rolling_median = (
        float(statistics.median(value for _, value in median_samples))
        if median_samples
        else float(expected)
    )
    sample_count = len(median_samples)

    gap_started_at = None
    gap_duration = timedelta(0)
    if expected > 0 and samples:
        latest_time, latest_count = samples[-1]
        if (
            latest_count < expected
            and reference_time - latest_time <= ATTENDANCE_MAX_SAMPLE_GAP
        ):
            gap_started_at = latest_time
            for previous_time, previous_count in reversed(samples[:-1]):
                if (
                    previous_count >= expected
                    or latest_time - previous_time > ATTENDANCE_MAX_SAMPLE_GAP
                ):
                    break
                gap_started_at = previous_time
                latest_time = previous_time
            gap_duration = samples[-1][0] - gap_started_at

    gap_persisted = gap_duration > ATTENDANCE_GAP_ALERT_THRESHOLD
    return {
        "rolling_median": rolling_median,
        "sample_count": sample_count,
        "gap_duration_seconds": max(0, int(gap_duration.total_seconds())),
        "gap_persisted": gap_persisted,
        "gap_started_at": gap_started_at.isoformat() if gap_started_at else None,
        "risk_headcount": rolling_median if gap_persisted else float(expected),
    }


def calculate_centre_risk(centre, attendance_headcount: Optional[float] = None):
    marked_present = max(0, int(centre["official_marked_present"] or 0))
    score_headcount = (
        float(centre["live_headcount"])
        if attendance_headcount is None
        else attendance_headcount
    )
    attendance_coverage_ratio = (
        score_headcount / marked_present if marked_present > 0 else 1.0
    )
    attendance_risk = _calculate_attendance_risk(marked_present, score_headcount)

    infra_penalty = (100 - centre["compliance_percentage"]) * 0.5
    final_score = min(100.0, round(attendance_risk + infra_penalty, 1))
    centre["fraud_risk_score"] = final_score
    centre["attendance_risk_score"] = attendance_risk
    centre["infra_risk_score"] = round(infra_penalty, 1)

    if (
        final_score > 60.0
        or attendance_coverage_ratio < 0.5
        or centre["compliance_percentage"] < 60.0
    ):
        centre["status"] = (
            "FLAGGED" if attendance_coverage_ratio < 0.5 else "HIGH_RISK"
        )
    elif final_score > 30.0:
        centre["status"] = "WARNING"
    else:
        centre["status"] = "SAFE"


def centre_to_dict(record: CentreRecord) -> dict:
    infra_pen = (100 - record.compliance_percentage) * 0.5

    return {
        "name": record.name,
        "registered_total": record.registered_total,
        "official_marked_present": record.official_marked_present,
        "live_headcount": record.live_headcount,
        "detected_computers": record.detected_computers,
        "required_computers": record.required_computers,
        "compliance_percentage": record.compliance_percentage,
        "fraud_risk_score": record.fraud_risk_score,
        "attendance_risk_score": record.attendance_risk_score,
        "infra_risk_score": round(infra_pen, 1),
        "status": record.status,
        "equipment_config": json.loads(record.equipment_config) if record.equipment_config else None,
    }


def _configured_computer_requirement(centre: dict) -> int:
    equipment_config = centre.get("equipment_config") or {}
    for item in equipment_config.get("classes", []):
        if item.get("name") == "computer":
            return max(0, int(item["required"]))
    return max(0, int(centre.get("required_computers", 0)))


def _live_computer_compliance(centre: dict, detected: int) -> dict:
    required = _configured_computer_requirement(centre)
    compliance = min(100.0, detected / required * 100) if required else 100.0
    return {
        "required_computers": required,
        "compliance_percentage": round(compliance, 1),
        "status": (
            "COMPLIANT" if compliance >= 80
            else "PARTIAL" if compliance >= 50
            else "DEFICIENT"
        ),
    }


def _canonical_live_infrastructure_message(
    centre_id: str,
    message: dict,
) -> dict:
    detected = message.get("detected_computers")
    centre = db_store["centres"].get(centre_id)
    if (
        not isinstance(detected, int)
        or isinstance(detected, bool)
        or detected < 0
        or centre is None
    ):
        return message
    return {
        **message,
        **_live_computer_compliance(centre, detected),
    }


def _infra_frame_matches_source(centre_id: str, message: dict) -> bool:
    return (
        message.get("source_stream") == "attendance"
        and message.get("source_centre_id") == centre_id
        and isinstance(message.get("camera_id"), str)
        and bool(message["camera_id"].strip())
    )


def persist_centre(db: Session, centre_id: str, centre: dict) -> CentreRecord:
    record = db.get(CentreRecord, centre_id)
    if record is None:
        record = CentreRecord(centre_id=centre_id, **centre)
        db.add(record)
    else:
        for key, value in centre.items():
            if key == "equipment_config" and isinstance(value, dict):
                setattr(record, key, json.dumps(value))
            else:
                setattr(record, key, value)
    db.flush()
    return record


def refresh_cache(db: Session) -> None:
    """Refresh the cache from persistent SQLite records, excluding placeholder string data."""
    centres = db.scalars(select(CentreRecord).where(CentreRecord.centre_id != "string")).all()
    latest_attendance_ids = (
        select(func.max(AttendanceRecord.id).label("latest_id"))
        .where(AttendanceRecord.centre_id != "string")
        .group_by(AttendanceRecord.centre_id)
        .subquery()
    )
    latest_attendance = db.scalars(
        select(AttendanceRecord).where(
            AttendanceRecord.id.in_(
                select(latest_attendance_ids.c.latest_id)
            )
        )
    ).all()
    latest_attendance_at = {
        row.centre_id: row.timestamp for row in latest_attendance
    }
    cached_centres = {}
    for row in centres:
        centre = centre_to_dict(row)
        signal = get_attendance_signal(
            db,
            row.centre_id,
            row.official_marked_present,
        )
        centre.update({
            "attendance_rolling_median": signal["rolling_median"],
            "attendance_sample_count": signal["sample_count"],
            "attendance_gap_duration_seconds": signal["gap_duration_seconds"],
            "attendance_gap_active": signal["gap_persisted"],
            "attendance_gap_started_at": signal["gap_started_at"],
            "last_attendance_at": latest_attendance_at.get(row.centre_id),
        })
        cached_centres[row.centre_id] = centre
    db_store["centres"] = cached_centres

    attendance = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.centre_id != "string").order_by(AttendanceRecord.id.desc()).limit(10)
    ).all()
    db_store["attendance_logs"] = [
        {"centre_id": row.centre_id, "live_headcount": row.live_headcount, "timestamp": row.timestamp}
        for row in reversed(attendance)
    ]

    audits = db.scalars(
        select(AuditRecord)
        .where(AuditRecord.centre_id != "string")
        .order_by(AuditRecord.id.desc())
        .limit(100)
    ).all()
    db_store["audit_logs"] = [
        {
            "id": row.id,
            "centre_id": row.centre_id,
            "detected_computers": row.detected_computers,
            "required_computers": row.required_computers,
            "compliance_percentage": row.compliance_percentage,
            "status": row.status,
            "timestamp": row.timestamp,
            "evidence_available": bool(row.evidence_image or row.evidence_images),
            "views_captured": (
                len(json.loads(row.evidence_images))
                if row.evidence_images else int(bool(row.evidence_image))
            ),
            "detections_available": bool(row.equipment_results),
            "equipment_results": json.loads(row.equipment_results) if row.equipment_results else None,
            "detection_source": row.detection_source or "UNKNOWN",
            "archived_at": row.archived_at,
            "archived_by": row.archived_by,
        }
        for row in reversed(audits)
    ]


@app.on_event("startup")
def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        schema_columns = {
            "centres": {column["name"] for column in inspect(engine).get_columns("centres")},
            "audit_logs": {column["name"] for column in inspect(engine).get_columns("audit_logs")},
            "alerts": {column["name"] for column in inspect(engine).get_columns("alerts")},
            "auth_users": {column["name"] for column in inspect(engine).get_columns("auth_users")},
        }
        migrations = (
            ("centres", "equipment_config", "TEXT"),
            ("centres", "attendance_risk_score", "FLOAT NOT NULL DEFAULT 0"),
            ("auth_users", "centre_id", "VARCHAR(100)"),
            ("audit_logs", "evidence_image", "TEXT"),
            ("audit_logs", "evidence_images", "TEXT"),
            ("audit_logs", "annotated_images", "TEXT"),
            ("audit_logs", "equipment_results", "TEXT"),
            ("audit_logs", "detection_source", "VARCHAR(30)"),
            ("audit_logs", "archived_at", "VARCHAR(80)"),
            ("audit_logs", "archived_by", "VARCHAR(255)"),
            ("alerts", "resolved_by", "VARCHAR(255)"),
        )
        attendance_score_needs_backfill = (
            "attendance_risk_score" not in schema_columns["centres"]
        )
        with engine.begin() as connection:
            for table_name, column_name, column_type in migrations:
                if column_name not in schema_columns[table_name]:
                    connection.execute(
                        text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                    )
            connection.execute(
                text(
                    "UPDATE audit_logs SET detection_source = 'SIMULATED' "
                    "WHERE detection_source IS NULL AND equipment_results IS NOT NULL"
                )
            )

        if attendance_score_needs_backfill:
            for centre in db.scalars(select(CentreRecord)).all():
                centre.attendance_risk_score = _calculate_attendance_risk(
                    centre.official_marked_present,
                    centre.live_headcount,
                )
            db.commit()

        if db.scalar(select(CentreRecord.centre_id).limit(1)) is None:
            for centre_id, centre in INITIAL_CENTRES.items():
                db.add(CentreRecord(
                    centre_id=centre_id,
                    attendance_risk_score=_calculate_attendance_risk(
                        centre["official_marked_present"],
                        centre["live_headcount"],
                    ),
                    **centre,
                ))
            db.commit()

        bootstrap_username = os.getenv("SACH_BOOTSTRAP_ADMIN_USERNAME")
        bootstrap_password = os.getenv("SACH_BOOTSTRAP_ADMIN_PASSWORD")
        if bool(bootstrap_username) != bool(bootstrap_password):
            raise RuntimeError(
                "Set both SACH_BOOTSTRAP_ADMIN_USERNAME and "
                "SACH_BOOTSTRAP_ADMIN_PASSWORD, or leave both unset"
            )
        if bootstrap_username and bootstrap_password:
            bootstrap = LoginRequest(
                username=bootstrap_username,
                password=bootstrap_password,
            )
            admin = db.scalar(
                select(AuthUser).where(AuthUser.username == bootstrap.username)
            )
            if admin is None:
                db.add(AuthUser(
                    username=bootstrap.username,
                    password_hash=_hash_password(bootstrap.password),
                    role="ADMIN",
                    created_at=_utc_now().isoformat(),
                ))
                db.commit()
            elif admin.role != "ADMIN":
                raise RuntimeError(
                    "The configured bootstrap username already belongs "
                    "to a non-admin account"
                )
        refresh_cache(db)


@app.get("/")
def read_root():
    return {"status": "Online", "system": "MSDE PS 245 SACH Core"}


@app.post("/api/attendance/log")
def log_attendance(
    data: AttendanceLog,
    request: Request,
    db: Session = Depends(get_db),
):
    auth_user = getattr(request.state, "auth_user", {})
    if (
        _is_operator_role(auth_user.get("role"))
        and auth_user.get("centre_id") != data.centre_id
    ):
        raise HTTPException(
            status_code=403,
            detail="Operator accounts may submit attendance only for their assigned centre",
        )

    record = db.get(CentreRecord, data.centre_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Centre '{data.centre_id}' not found",
        )

    centre = centre_to_dict(record)

    log_entry = {
        "centre_id": data.centre_id,
        "live_headcount": data.live_headcount,
        "timestamp": data.timestamp or _utc_now().isoformat(),
    }

    sample_time = _as_utc_datetime(log_entry["timestamp"])
    db.add(AttendanceRecord(**log_entry))
    db.flush()
    signal = get_attendance_signal(
        db,
        data.centre_id,
        record.official_marked_present,
        as_of=sample_time,
    )
    centre["live_headcount"] = data.live_headcount
    calculate_centre_risk(centre, signal["risk_headcount"])
    persist_centre(db, data.centre_id, centre)
    db.commit()
    refresh_cache(db)

    return {
        "status": "SUCCESS",
        "logged": log_entry,
        "updated_centre_status": {
            **centre,
            "attendance_rolling_median": signal["rolling_median"],
            "attendance_sample_count": signal["sample_count"],
            "attendance_gap_duration_seconds": signal["gap_duration_seconds"],
            "attendance_gap_active": signal["gap_persisted"],
            "attendance_gap_started_at": signal["gap_started_at"],
        },
    }


@app.post("/api/audit/submit")
def submit_audit(data: AuditSubmission, db: Session = Depends(get_db)):
    record = db.get(CentreRecord, data.centre_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Centre '{data.centre_id}' not found",
        )

    centre = centre_to_dict(record)

    centre["detected_computers"] = data.detected_computers
    centre["required_computers"] = data.required_computers
    centre["compliance_percentage"] = data.compliance_percentage
    signal = get_attendance_signal(
        db,
        data.centre_id,
        record.official_marked_present,
    )
    calculate_centre_risk(centre, signal["risk_headcount"])

    log_entry = data.model_dump()
    log_entry["timestamp"] = datetime.now().isoformat()

    persist_centre(db, data.centre_id, centre)
    db.add(AuditRecord(**log_entry))
    db.commit()
    refresh_cache(db)

    return {"status": "SUCCESS", "received": log_entry, "updated_centre": centre}


@app.post("/api/audit/live")
def submit_live_infrastructure(data: LiveInfrastructureUpdate, db: Session = Depends(get_db)):
    record = db.get(CentreRecord, data.centre_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Centre '{data.centre_id}' not found",
        )

    centre = centre_to_dict(record)
    received_at = _utc_now().isoformat()
    live_status = {
        "centre_id": data.centre_id,
        "detected_computers": data.detected_computers,
        **_live_computer_compliance(centre, data.detected_computers),
        "timestamp": data.timestamp or received_at,
        "received_at": received_at,
    }
    live_infrastructure[data.centre_id] = live_status
    return {"status": "SUCCESS", "live": live_status}


# ============================================================
# INFRASTRUCTURE SCAN API (Feature 2 — Start New Scan)
# ============================================================


class ScanSubmission(BaseModel):
    centre_id: str
    base64_image: Optional[str] = Field(default=None, min_length=32, max_length=7_000_000)
    base64_images: Optional[list[str]] = Field(default=None, min_length=4, max_length=6)

    @field_validator("base64_image")
    @classmethod
    def validate_evidence_image(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _validate_evidence_image(value, max_bytes=5 * 1024 * 1024)

    @field_validator("base64_images")
    @classmethod
    def validate_evidence_images(
        cls, values: Optional[list[str]]
    ) -> Optional[list[str]]:
        if values is None:
            return values
        validated = [
            _validate_evidence_image(value, max_bytes=2 * 1024 * 1024)
            for value in values
        ]
        if sum(len(value) for value in validated) > 17_000_000:
            raise ValueError("Combined scan evidence must not exceed 17 MB")
        return validated

    @model_validator(mode="after")
    def require_evidence_images(self):
        if bool(self.base64_image) == bool(self.base64_images):
            raise ValueError("Provide either one base64_image or 4 to 6 base64_images")
        if self.base64_images:
            total_bytes = sum(
                len(base64.b64decode(value.partition(",")[2] if value.startswith("data:") else value))
                for value in self.base64_images
            )
            if total_bytes > 8 * 1024 * 1024:
                raise ValueError("Combined scan evidence must not exceed 8 MB")
        return self


def _validate_evidence_image(value: str, max_bytes: int) -> str:
    encoded_image = value
    media_type = None
    if value.startswith("data:"):
        header, separator, encoded_image = value.partition(",")
        if not separator:
            raise ValueError("Evidence image data URL is malformed")
        media_type = header.removeprefix("data:").removesuffix(";base64")
        if media_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("Evidence must be a JPEG, PNG, or WebP image")

    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except ValueError as error:
        raise ValueError("Evidence image must contain valid base64 data") from error

    if not image_bytes or len(image_bytes) > max_bytes:
        raise ValueError(f"Evidence image must be between 1 byte and {max_bytes // (1024 * 1024)} MB")

    signatures = {
        "image/jpeg": image_bytes.startswith(b"\xff\xd8\xff"),
        "image/png": image_bytes.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": (
            len(image_bytes) >= 12
            and image_bytes.startswith(b"RIFF")
            and image_bytes[8:12] == b"WEBP"
        ),
    }
    if media_type:
        is_supported_image = signatures[media_type]
    else:
        is_supported_image = any(signatures.values())
    if not is_supported_image:
        raise ValueError("Evidence data is not a supported image")
    return value


DEV2_ROOT = Path(os.getenv("SACH_DEV2_ROOT", str(BASE_DIR.parent.parent / "dev2")))
DEV2_PYTHON = os.getenv(
    "SACH_DEV2_PYTHON",
    str(
        DEV2_ROOT
        / ".venv"
        / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    ),
)
DEV2_INFERENCE_SCRIPT = DEV2_ROOT / "inference_cli.py"


def _run_dev2_inference(evidence_images: list[str], required: dict[str, int]) -> dict:
    interpreter = Path(DEV2_PYTHON)
    if not interpreter.is_file() or not DEV2_INFERENCE_SCRIPT.is_file():
        logger.error(
            "Dev2 inference is not configured: python=%s, script=%s",
            interpreter,
            DEV2_INFERENCE_SCRIPT,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "The Dev2 infrastructure detector is unavailable. "
                "Configure SACH_DEV2_PYTHON and check the Dev2 model files."
            ),
        )

    payload = json.dumps({
        "images": evidence_images,
        "required": required,
    })
    try:
        process = subprocess.run(
            [str(interpreter), str(DEV2_INFERENCE_SCRIPT)],
            input=payload,
            capture_output=True,
            text=True,
            timeout=180,
            cwd=DEV2_ROOT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        logger.error("Dev2 infrastructure inference exceeded its 180-second timeout")
        raise HTTPException(
            status_code=504,
            detail="The Dev2 detector timed out. Try fewer or smaller evidence images.",
        ) from error
    except OSError as error:
        logger.exception("Could not start the Dev2 infrastructure detector")
        raise HTTPException(
            status_code=503,
            detail="Could not start the Dev2 detector. Check backend logs.",
        ) from error

    if process.returncode != 0:
        logger.error("Dev2 inference failed: %s", process.stderr[-4000:])
        raise HTTPException(
            status_code=502,
            detail="The Dev2 detector failed to analyze this scan. Check backend logs.",
        )

    try:
        result = json.loads(process.stdout)
    except json.JSONDecodeError as error:
        logger.error("Dev2 inference returned invalid JSON: %s", process.stderr[-4000:])
        raise HTTPException(
            status_code=502,
            detail="The Dev2 detector returned an invalid result. Check backend logs.",
        ) from error

    if (
        not isinstance(result, dict)
        or not isinstance(result.get("detected"), dict)
        or not isinstance(result.get("views"), list)
        or len(result["views"]) != len(evidence_images)
        or not isinstance(result.get("annotated_images"), list)
        or len(result["annotated_images"]) != len(evidence_images)
        or not isinstance(result.get("supported_classes"), list)
    ):
        logger.error("Dev2 inference result did not match the submitted evidence views")
        raise HTTPException(
            status_code=502,
            detail="The Dev2 detector returned an incomplete result. Check backend logs.",
        )
    return result


@app.get("/api/centres/{centre_id}/equipment-config")
def get_centre_equipment_config(centre_id: str, db: Session = Depends(get_db)):
    record = db.get(CentreRecord, centre_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Centre '{centre_id}' not found")

    centre = centre_to_dict(record)
    cfg = centre["equipment_config"] or {
        "classes": [
            {"name": "computer", "label": "Computers", "required": 15},
            {"name": "chair", "label": "Chairs", "required": 20},
            {"name": "desk", "label": "Desks", "required": 18},
            {"name": "whiteboard", "label": "Whiteboards", "required": 2},
        ]
    }

    return {"centre_id": centre_id, "equipment_config": cfg, "required_computers": record.required_computers}


@app.put("/api/centres/{centre_id}/equipment-config")
def update_centre_equipment_config(
    centre_id: str,
    data: EquipmentConfig,
    db: Session = Depends(get_db),
):
    record = db.get(CentreRecord, centre_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Centre '{centre_id}' not found")

    config = data.model_dump()
    record.equipment_config = json.dumps(config)
    record.required_computers = next(
        item["required"] for item in config["classes"] if item["name"] == "computer"
    )
    db.commit()
    refresh_cache(db)
    return {
        "centre_id": centre_id,
        "equipment_config": config,
        "required_computers": record.required_computers,
    }


@app.post("/api/centres/{centre_id}/scan")
def run_infrastructure_scan(centre_id: str, data: ScanSubmission, db: Session = Depends(get_db)):
    if data.centre_id != centre_id:
        raise HTTPException(status_code=422, detail="centre_id must match the centre in the URL")

    evidence_images = (
        data.base64_images
        if data.base64_images is not None
        else [data.base64_image] if data.base64_image is not None else []
    )
    if not evidence_images:
        raise HTTPException(status_code=422, detail="At least one evidence image is required")

    record = db.get(CentreRecord, centre_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Centre '{centre_id}' not found")

    centre = centre_to_dict(record)
    equipment_config = centre["equipment_config"]
    if not equipment_config:
        equipment_config = {
            "classes": [
                {"name": "computer", "label": "Computers", "required": record.required_computers}
            ]
        }

    required = {
        item["name"]: item["required"]
        for item in equipment_config["classes"]
    }
    inference = _run_dev2_inference(evidence_images, required)
    detected_equipment = inference["detected"]

    supported_classes = set(inference["supported_classes"])
    unsupported_classes = sorted(set(required) - supported_classes)
    class_results = []
    for item in equipment_config["classes"]:
        required_count = item["required"]
        is_supported = item["name"] in supported_classes
        detected_count = (
            int(detected_equipment.get(item["name"], 0))
            if is_supported else None
        )
        class_results.append({
            **item,
            "detected": detected_count,
            "missing": max(0, required_count - detected_count) if is_supported else None,
            "compliance_percentage": (
                min(100.0, round(detected_count / required_count * 100, 1))
                if required_count > 0 and is_supported
                else 100.0 if is_supported else None
            ),
        })

    supported_results = [item for item in class_results if item["detected"] is not None]
    total_required = sum(item["required"] for item in supported_results)
    compliant_total = sum(
        min(item["detected"], item["required"]) for item in class_results
        if item["detected"] is not None
    )
    compliance = (
        round(compliant_total / total_required * 100, 1)
        if total_required > 0
        else 0.0 if unsupported_classes else 100.0
    )
    status = (
        "REVIEW"
        if unsupported_classes or compliance < 80
        else "PASS"
    )

    detected_computers = int(detected_equipment.get("computer", 0))
    required_computers = record.required_computers
    timestamp = _utc_now().isoformat()
    detection_results = {
        "model": inference["model"],
        "device": inference["device"],
        "views": inference["views"],
        "classes": class_results,
        "unsupported_classes": unsupported_classes,
        "compliance_scope": "Dev2-supported equipment classes only",
    }

    log_entry = {
        "centre_id": centre_id,
        "detected_computers": detected_computers,
        "required_computers": required_computers,
        "compliance_percentage": compliance,
        "status": status,
        "timestamp": timestamp,
        "evidence_image": evidence_images[0],
        "evidence_images": json.dumps(evidence_images),
        "annotated_images": json.dumps(inference["annotated_images"]),
        "equipment_results": json.dumps(detection_results),
        "detection_source": "DEV2_YOLO",
    }

    db.add(AuditRecord(**log_entry))
    db.commit()
    refresh_cache(db)

    return {
        "centre_id": centre_id,
        "detected": detected_equipment,
        "classes": class_results,
        "views": inference["views"],
        "annotated_images": inference["annotated_images"],
        "model": inference["model"],
        "device": inference["device"],
        "unsupported_classes": unsupported_classes,
        "compliance_scope": "Dev2-supported equipment classes only",
        "detected_computers": detected_computers,
        "required_computers": required_computers,
        "total_detected": sum(
            item["detected"]
            for item in class_results
            if item["detected"] is not None
        ),
        "total_required": total_required,
        "compliance_percentage": compliance,
        "status": status,
        "submission_status": "SUCCESS",
        "detection_source": "DEV2_YOLO",
        "authoritative_centre_metrics_updated": False,
        "views_captured": len(evidence_images),
        "timestamp": timestamp,
    }


@app.get("/api/audits/{audit_id}/evidence")
def get_audit_evidence(audit_id: int, db: Session = Depends(get_db)):
    audit = db.get(AuditRecord, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit record not found")

    images = (
        json.loads(audit.evidence_images)
        if audit.evidence_images
        else [audit.evidence_image] if audit.evidence_image else []
    )
    annotated_images = (
        json.loads(audit.annotated_images)
        if audit.annotated_images else []
    )
    return {
        "audit_id": audit.id,
        "centre_id": audit.centre_id,
        "detection_source": audit.detection_source or "UNKNOWN",
        "images": images,
        "annotated_images": annotated_images,
        "results": json.loads(audit.equipment_results) if audit.equipment_results else None,
    }


@app.post("/api/audits/{audit_id}/archive")
def archive_audit_record(
    audit_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    audit = db.get(AuditRecord, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit record not found")
    if audit.archived_at is None:
        audit.archived_at = _utc_now().isoformat()
        audit.archived_by = request.state.auth_user["username"]
        db.commit()
    refresh_cache(db)
    return {"status": "ARCHIVED", "audit_id": audit.id, "archived_at": audit.archived_at}


@app.post("/api/audits/{audit_id}/restore")
def restore_audit_record(
    audit_id: int,
    db: Session = Depends(get_db),
):
    audit = db.get(AuditRecord, audit_id)
    if audit is None:
        raise HTTPException(status_code=404, detail="Audit record not found")
    audit.archived_at = None
    audit.archived_by = None
    db.commit()
    refresh_cache(db)
    return {"status": "RESTORED", "audit_id": audit.id}


@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    refresh_cache(db)
    return {
        "total_centres_monitored": len(db_store["centres"]),
        "centres": db_store["centres"],
        "live_infrastructure": {
            centre_id: update.copy()
            for centre_id, update in live_infrastructure.items()
        },
        "recent_attendance_logs": db_store["attendance_logs"][-10:],
        "recent_audit_logs": db_store["audit_logs"][-100:],
    }

# ============================================================
# PERSISTENT ALERTS API
# ============================================================

class AlertRecord(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    centre_id: Mapped[str] = mapped_column(
        ForeignKey("centres.centre_id"), index=True, nullable=False
    )
    alert_type: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default="OPEN", nullable=False, index=True
    )
    created_at: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(80), nullable=False)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    resolved_by: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )


class AlertAction(BaseModel):
    actor: str = "System Operator"


def _alert_to_dict(alert: AlertRecord) -> dict:
    return {
        "id": alert.id,
        "centre_id": alert.centre_id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
        "status": alert.status,
        "created_at": alert.created_at,
        "updated_at": alert.updated_at,
        "acknowledged_by": alert.acknowledged_by,
        "resolved_by": alert.resolved_by,
    }


def _sync_centre_alerts(db: Session, as_of: Optional[datetime] = None) -> None:
    reference_time = _as_utc_datetime(as_of or _utc_now())
    now = reference_time.isoformat()
    centres = db.scalars(select(CentreRecord).where(CentreRecord.centre_id != "string")).all()

    for centre in centres:
        expected = centre.official_marked_present
        signal = get_attendance_signal(
            db,
            centre.centre_id,
            expected,
            as_of=reference_time,
        )
        ratio = (
            signal["rolling_median"] / expected
            if expected > 0
            else 1.0
        )

        desired = []

        if centre.status in ("FLAGGED", "HIGH_RISK"):
            desired.append({
                "alert_type": "CENTRE_RISK",
                "severity": "HIGH",
                "title": "Centre requires review",
                "message": (
                    f"Centre status is {centre.status}; "
                    f"recorded risk score is {centre.fraud_risk_score}."
                ),
            })
        elif centre.status == "WARNING":
            desired.append({
                "alert_type": "CENTRE_RISK",
                "severity": "MEDIUM",
                "title": "Centre risk warning",
                "message": (
                    f"Centre status is WARNING; "
                    f"recorded risk score is {centre.fraud_risk_score}."
                ),
            })

        if signal["gap_persisted"] and expected > 0 and ratio < 1.0:
            desired.append({
                "alert_type": "ATTENDANCE_GAP",
                "severity": "HIGH" if ratio < 0.5 else "MEDIUM",
                "title": (
                    "Significant attendance discrepancy"
                    if ratio < 0.5
                    else "Persistent attendance discrepancy"
                ),
                "message": (
                    f"The 10-minute rolling median is {signal['rolling_median']:g}, "
                    f"while {expected} learners are officially marked present. "
                    f"The discrepancy persisted for at least "
                    f"{signal['gap_duration_seconds']} seconds. "
                    "Review the evidence before drawing conclusions."
                ),
            })

        if centre.compliance_percentage < 60:
            desired.append({
                "alert_type": "INFRASTRUCTURE_COMPLIANCE",
                "severity": "HIGH",
                "title": "Low infrastructure compliance",
                "message": (
                    f"Detected {centre.detected_computers} computers "
                    f"against {centre.required_computers} required; "
                    f"reported compliance is "
                    f"{centre.compliance_percentage}%."
                ),
            })

        desired_by_type = {
            item["alert_type"]: item for item in desired
        }

        existing = db.scalars(
            select(AlertRecord).where(
                AlertRecord.centre_id == centre.centre_id,
                AlertRecord.status.in_(["OPEN", "ACKNOWLEDGED"]),
            )
        ).all()

        existing_by_type = {
            alert.alert_type: alert for alert in existing
        }

        for alert_type, item in desired_by_type.items():
            alert = existing_by_type.get(alert_type)

            if alert is None:
                db.add(AlertRecord(
                    centre_id=centre.centre_id,
                    alert_type=alert_type,
                    severity=item["severity"],
                    title=item["title"],
                    message=item["message"],
                    status="OPEN",
                    created_at=now,
                    updated_at=now,
                ))
            else:
                alert.severity = item["severity"]
                alert.title = item["title"]
                alert.message = item["message"]
                alert.updated_at = now

        for alert in existing:
            if alert.alert_type not in desired_by_type:
                alert.status = "RESOLVED"
                alert.updated_at = now

    db.flush()


def _filtered_alerts(
    db: Session,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    centre_id: Optional[str] = None,
) -> list[AlertRecord]:
    query = select(AlertRecord).where(AlertRecord.centre_id != "string")

    if status and status.upper() == "ACTIVE":
        query = query.where(
            AlertRecord.status.in_(("OPEN", "ACKNOWLEDGED"))
        )
    elif status:
        query = query.where(AlertRecord.status == status.upper())

    if severity:
        query = query.where(AlertRecord.severity == severity.upper())

    if centre_id:
        query = query.where(AlertRecord.centre_id == centre_id)

    query = query.order_by(AlertRecord.id.desc())
    return list(db.scalars(query).all())


@app.get("/api/alerts")
def list_alerts(
    status: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    centre_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    _sync_centre_alerts(db)
    db.commit()

    alerts = _filtered_alerts(
        db,
        status=status,
        severity=severity,
        centre_id=centre_id,
    )

    return {
        "total": len(alerts),
        "alerts": [_alert_to_dict(alert) for alert in alerts],
    }


@app.get("/api/alerts/summary")
def get_alert_summary(db: Session = Depends(get_db)):
    _sync_centre_alerts(db)
    db.commit()

    alerts = db.scalars(select(AlertRecord).where(AlertRecord.centre_id != "string")).all()
    active = [
        alert for alert in alerts
        if alert.status in ("OPEN", "ACKNOWLEDGED")
    ]

    return {
        "total_active": len(active),
        "open": sum(a.status == "OPEN" for a in active),
        "acknowledged": sum(
            a.status == "ACKNOWLEDGED" for a in active
        ),
        "high": sum(
            a.severity in ("HIGH", "CRITICAL") for a in active
        ),
        "medium": sum(
            a.severity == "MEDIUM" for a in active
        ),
        "low": sum(
            a.severity == "LOW" for a in active
        ),
        "resolved": sum(
            a.status == "RESOLVED" for a in alerts
        ),
    }


@app.post("/api/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    data: AlertAction,
    request: Request,
    db: Session = Depends(get_db),
):
    alert = db.get(AlertRecord, alert_id)

    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.status == "RESOLVED":
        raise HTTPException(
            status_code=409,
            detail="A resolved alert cannot be acknowledged",
        )

    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = request.state.auth_user["username"]
    alert.updated_at = datetime.now().isoformat()

    db.commit()
    db.refresh(alert)

    return {
        "status": "SUCCESS",
        "alert": _alert_to_dict(alert),
    }


@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    request: Request,
    data: Optional[AlertAction] = None,
    db: Session = Depends(get_db),
):
    alert = db.get(AlertRecord, alert_id)

    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "RESOLVED"
    alert.updated_at = datetime.now().isoformat()
    alert.resolved_by = request.state.auth_user["username"]

    db.commit()
    db.refresh(alert)

    return {
        "status": "SUCCESS",
        "alert": _alert_to_dict(alert),
    }

# ============================================================
# REPORTS, ANALYTICS & CSV EXPORT
# ============================================================

def _report_timestamp(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _report_centre_dict(centre):
    return {
        "centre_id": centre.centre_id,
        "name": centre.name,
        "registered_total": centre.registered_total,
        "official_marked_present": centre.official_marked_present,
        "live_headcount": centre.live_headcount,
        "detected_computers": centre.detected_computers,
        "required_computers": centre.required_computers,
        "compliance_percentage": centre.compliance_percentage,
        "fraud_risk_score": centre.fraud_risk_score,
        "status": centre.status,
        "equipment_config": json.loads(centre.equipment_config) if centre.equipment_config else None,
    }


def _normalise_report_date(value, is_end=False):
    if not value:
        return None
    value = value.strip()
    if len(value) == 10:
        return value + ("T23:59:59.999999" if is_end else "T00:00:00")
    return value


def _timestamp_in_range(timestamp, start_date=None, end_date=None):
    stamp = _report_timestamp(timestamp)
    if not stamp:
        return not start_date and not end_date

    stamp = stamp.replace("Z", "+00:00")

    if start_date:
        start = _normalise_report_date(start_date)
        if stamp < start:
            return False

    if end_date:
        end = _normalise_report_date(end_date, is_end=True)
        if stamp > end:
            return False

    return True


@app.get("/api/reports/overview")
def get_reports_overview(db: Session = Depends(get_db)):
    centres = db.execute(select(CentreRecord).where(CentreRecord.centre_id != "string")).scalars().all()
    attendance_logs = db.execute(
        select(AttendanceRecord).where(AttendanceRecord.centre_id != "string").order_by(AttendanceRecord.id.desc())
    ).scalars().all()
    audit_logs = db.execute(
        select(AuditRecord).where(AuditRecord.centre_id != "string").order_by(AuditRecord.id.desc())
    ).scalars().all()

    status_counts = {}
    for centre in centres:
        status = (centre.status or "UNKNOWN").upper()
        status_counts[status] = status_counts.get(status, 0) + 1

    compliance_values = [
        float(c.compliance_percentage or 0)
        for c in centres
    ]

    attendance_ratios = []
    for centre in centres:
        expected = int(centre.official_marked_present or 0)
        if expected > 0:
            actual = int(centre.live_headcount or 0)
            attendance_ratios.append(
                min(100.0, (actual / expected) * 100.0)
            )

    average_compliance = (
        round(sum(compliance_values) / len(compliance_values), 2)
        if compliance_values else 0.0
    )

    average_attendance_ratio = (
        round(sum(attendance_ratios) / len(attendance_ratios), 2)
        if attendance_ratios else 0.0
    )

    high_risk_statuses = {"FLAGGED", "HIGH_RISK"}

    return {
        "success": True,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "summary": {
            "total_centres": len(centres),
            "safe_centres": status_counts.get("SAFE", 0),
            "warning_centres": status_counts.get("WARNING", 0),
            "high_risk_centres": sum(
                status_counts.get(status, 0)
                for status in high_risk_statuses
            ),
            "average_compliance_percentage": average_compliance,
            "average_attendance_ratio_percentage": average_attendance_ratio,
            "total_attendance_records": len(attendance_logs),
            "total_audit_records": len(audit_logs),
        },
        "status_breakdown": status_counts,
        "centres": [_report_centre_dict(c) for c in centres],
        "recent_attendance": [
            {
                "id": log.id,
                "centre_id": log.centre_id,
                "live_headcount": log.live_headcount,
                "timestamp": _report_timestamp(log.timestamp),
            }
            for log in attendance_logs[:10]
        ],
        "recent_audits": [
            {
                "id": log.id,
                "centre_id": log.centre_id,
                "detected_computers": log.detected_computers,
                "required_computers": log.required_computers,
                "compliance_percentage": log.compliance_percentage,
                "status": log.status,
                "timestamp": _report_timestamp(log.timestamp),
            }
            for log in audit_logs[:10]
        ],
    }


@app.get("/api/reports/centres/{centre_id}")
def get_centre_report(
    centre_id: str,
    history_limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    centre = db.get(CentreRecord, centre_id)

    if centre is None:
        raise HTTPException(
            status_code=404,
            detail=f"Centre '{centre_id}' was not found.",
        )

    attendance_logs = db.execute(
        select(AttendanceRecord)
        .where(AttendanceRecord.centre_id == centre_id)
        .order_by(AttendanceRecord.id.desc())
        .limit(history_limit)
    ).scalars().all()

    audit_logs = db.execute(
        select(AuditRecord)
        .where(AuditRecord.centre_id == centre_id)
        .order_by(AuditRecord.id.desc())
        .limit(history_limit)
    ).scalars().all()

    return {
        "success": True,
        "centre": _report_centre_dict(centre),
        "attendance_history": [
            {
                "id": log.id,
                "live_headcount": log.live_headcount,
                "timestamp": _report_timestamp(log.timestamp),
            }
            for log in attendance_logs
        ],
        "audit_history": [
            {
                "id": log.id,
                "detected_computers": log.detected_computers,
                "required_computers": log.required_computers,
                "compliance_percentage": log.compliance_percentage,
                "status": log.status,
                "timestamp": _report_timestamp(log.timestamp),
            }
            for log in audit_logs
        ],
        "history_limits": {
            "attendance": history_limit,
            "audits": history_limit,
        },
    }


@app.get("/api/reports/attendance")
def get_attendance_report(
    centre_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must not be later than end_date.",
        )

    statement = select(AttendanceRecord).where(AttendanceRecord.centre_id != "string")

    if centre_id:
        statement = statement.where(
            AttendanceRecord.centre_id == centre_id
        )

    logs = db.execute(
        statement.order_by(AttendanceRecord.id.desc())
    ).scalars().all()

    filtered_logs = [
        log for log in logs
        if _timestamp_in_range(
            log.timestamp,
            start_date=start_date,
            end_date=end_date,
        )
    ]

    total_matching_records = len(filtered_logs)
    selected_logs = filtered_logs[:limit]

    return {
        "success": True,
        "filters": {
            "centre_id": centre_id,
            "start_date": start_date,
            "end_date": end_date,
            "limit": limit,
        },
        "total_matching_records": total_matching_records,
        "returned_records": len(selected_logs),
        "records": [
            {
                "id": log.id,
                "centre_id": log.centre_id,
                "live_headcount": log.live_headcount,
                "timestamp": _report_timestamp(log.timestamp),
            }
            for log in selected_logs
        ],
    }


@app.get("/api/reports/compliance")
def get_compliance_report(
    status: Optional[str] = None,
    min_compliance: Optional[float] = Query(default=None, ge=0, le=100),
    max_compliance: Optional[float] = Query(default=None, ge=0, le=100),
    db: Session = Depends(get_db),
):
    if (
        min_compliance is not None
        and max_compliance is not None
        and min_compliance > max_compliance
    ):
        raise HTTPException(
            status_code=400,
            detail="min_compliance must not exceed max_compliance.",
        )

    centres = db.execute(
        select(CentreRecord).where(CentreRecord.centre_id != "string").order_by(
            CentreRecord.compliance_percentage.asc()
        )
    ).scalars().all()

    filtered_centres = []

    for centre in centres:
        compliance = float(centre.compliance_percentage or 0)

        if status and (centre.status or "").upper() != status.upper():
            continue

        if min_compliance is not None and compliance < min_compliance:
            continue

        if max_compliance is not None and compliance > max_compliance:
            continue

        filtered_centres.append(centre)

    values = [
        float(c.compliance_percentage or 0)
        for c in filtered_centres
    ]

    return {
        "success": True,
        "filters": {
            "status": status,
            "min_compliance": min_compliance,
            "max_compliance": max_compliance,
        },
        "summary": {
            "total_matching_centres": len(filtered_centres),
            "average_compliance_percentage": (
                round(sum(values) / len(values), 2) if values else 0.0
            ),
            "below_60_percent": sum(1 for value in values if value < 60),
            "between_60_and_79_percent": sum(
                1 for value in values if 60 <= value < 80
            ),
            "80_percent_and_above": sum(
                1 for value in values if value >= 80
            ),
        },
        "records": [
            {
                **_report_centre_dict(centre),
                "computer_shortfall": max(
                    0,
                    int(centre.required_computers or 0)
                    - int(centre.detected_computers or 0),
                ),
            }
            for centre in filtered_centres
        ],
    }


@app.get("/api/reports/export.csv")
def export_report_csv(
    report_type: str = "attendance",
    db: Session = Depends(get_db),
):
    report_type = report_type.strip().lower()

    if report_type not in {"attendance", "compliance", "centres"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid report_type. Use attendance, "
                "compliance, or centres."
            ),
        )

    output = io.StringIO(newline="")
    writer = csv.writer(output)

    if report_type == "attendance":
        writer.writerow([
            "id",
            "centre_id",
            "live_headcount",
            "timestamp",
        ])

        logs = db.execute(
            select(AttendanceRecord).where(AttendanceRecord.centre_id != "string").order_by(
                AttendanceRecord.id.desc()
            ).limit(5000)
        ).scalars().all()

        for log in logs:
            writer.writerow([
                log.id,
                log.centre_id,
                log.live_headcount,
                _report_timestamp(log.timestamp),
            ])

    elif report_type == "compliance":
        writer.writerow([
            "centre_id",
            "centre_name",
            "detected_computers",
            "required_computers",
            "computer_shortfall",
            "compliance_percentage",
            "fraud_risk_score",
            "status",
        ])

        centres = db.execute(
            select(CentreRecord).where(CentreRecord.centre_id != "string").order_by(
                CentreRecord.compliance_percentage.asc()
            )
        ).scalars().all()

        for centre in centres:
            writer.writerow([
                centre.centre_id,
                centre.name,
                centre.detected_computers,
                centre.required_computers,
                max(
                    0,
                    int(centre.required_computers or 0)
                    - int(centre.detected_computers or 0),
                ),
                centre.compliance_percentage,
                centre.fraud_risk_score,
                centre.status,
            ])

    else:
        writer.writerow([
            "centre_id",
            "centre_name",
            "registered_total",
            "official_marked_present",
            "live_headcount",
            "detected_computers",
            "required_computers",
            "compliance_percentage",
            "fraud_risk_score",
            "status",
        ])

        centres = db.execute(
            select(CentreRecord).where(CentreRecord.centre_id != "string").order_by(CentreRecord.centre_id)
        ).scalars().all()

        for centre in centres:
            writer.writerow([
                centre.centre_id,
                centre.name,
                centre.registered_total,
                centre.official_marked_present,
                centre.live_headcount,
                centre.detected_computers,
                centre.required_computers,
                centre.compliance_percentage,
                centre.fraud_risk_score,
                centre.status,
            ])

    filename = f"sach_{report_type}_report.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )

# ============================================================
# DASHBOARD OVERVIEW & AGGREGATED METRICS
# ============================================================

@app.get("/api/dashboard/overview")
def get_dashboard_overview(db: Session = Depends(get_db)):
    centres = db.scalars(
        select(CentreRecord).where(CentreRecord.centre_id != "string").order_by(CentreRecord.centre_id)
    ).all()

    status_breakdown = {"SAFE": 0, "WARNING": 0, "HIGH_RISK": 0, "FLAGGED": 0}

    for centre in centres:
        status = (centre.status or "UNKNOWN").upper()
        status_breakdown[status] = status_breakdown.get(status, 0) + 1

    total_centres = len(centres)
    safe_centres = status_breakdown.get("SAFE", 0)
    warning_centres = status_breakdown.get("WARNING", 0)
    flagged_centres = status_breakdown.get("FLAGGED", 0)
    high_risk_centres = status_breakdown.get("HIGH_RISK", 0)

    total_officially_present = sum(
        max(0, centre.official_marked_present or 0)
        for centre in centres
    )

    total_live_headcount = sum(
        max(0, centre.live_headcount or 0)
        for centre in centres
    )

    total_attendance_gap = sum(
        max(
            0,
            (centre.official_marked_present or 0) - (centre.live_headcount or 0),
        )
        for centre in centres
    )

    attendance_coverage = (
        round(
            total_live_headcount / total_officially_present * 100,
            2,
        )
        if total_officially_present > 0
        else 0.0
    )

    average_compliance = (
        round(
            sum(float(c.compliance_percentage or 0) for c in centres)
            / total_centres,
            2,
        )
        if total_centres
        else 0.0
    )

    average_risk_score = (
        round(
            sum(float(c.fraud_risk_score or 0) for c in centres)
            / total_centres,
            2,
        )
        if total_centres
        else 0.0
    )

    _sync_centre_alerts(db)
    db.commit()

    alerts = db.scalars(
        select(AlertRecord).where(AlertRecord.centre_id != "string").order_by(AlertRecord.id.desc())
    ).all()

    active_alerts = [
        alert for alert in alerts
        if alert.status in ("OPEN", "ACKNOWLEDGED")
    ]

    high_risk_and_flagged = high_risk_centres + flagged_centres

    alert_summary = {
        "total_active": len(active_alerts),
        "open": sum(a.status == "OPEN" for a in active_alerts),
        "acknowledged": sum(
            a.status == "ACKNOWLEDGED" for a in active_alerts
        ),
        "high": sum(
            alert.severity in ("HIGH", "CRITICAL")
            for alert in active_alerts
        ),
        "medium": sum(
            alert.severity == "MEDIUM"
            for alert in active_alerts
        ),
        "low": sum(
            alert.severity == "LOW"
            for alert in active_alerts
        ),
        "resolved": sum(a.status == "RESOLVED" for a in alerts),
    }

    attention_centres = []

    for centre in centres:
        if centre.status in ("FLAGGED", "HIGH_RISK", "WARNING"):
            attention_centres.append({
                "centre_id": centre.centre_id,
                "name": centre.name,
                "status": centre.status,
                "fraud_risk_score": centre.fraud_risk_score,
                "compliance_percentage": centre.compliance_percentage,
                "official_marked_present": centre.official_marked_present,
                "live_headcount": centre.live_headcount,
                "attendance_gap": max(
                    0,
                    centre.official_marked_present - centre.live_headcount,
                ),
                "computer_shortfall": max(
                    0,
                    centre.required_computers - centre.detected_computers,
                ),
            })

    attention_centres.sort(
        key=lambda centre: (
            -float(centre["fraud_risk_score"] or 0),
            float(centre["compliance_percentage"] or 0),
        )
    )

    recent_attendance = db.scalars(
        select(AttendanceRecord)
        .where(AttendanceRecord.centre_id != "string")
        .order_by(AttendanceRecord.id.desc())
        .limit(10)
    ).all()

    recent_audits = db.scalars(
        select(AuditRecord)
        .where(AuditRecord.centre_id != "string")
        .order_by(AuditRecord.id.desc())
        .limit(10)
    ).all()

    recent_activity = []

    for log in recent_attendance:
        recent_activity.append({
            "event_type": "ATTENDANCE",
            "centre_id": log.centre_id,
            "timestamp": log.timestamp,
            "details": {
                "live_headcount": log.live_headcount,
            },
        })

    for log in recent_audits:
        recent_activity.append({
            "event_type": "INFRASTRUCTURE_AUDIT",
            "centre_id": log.centre_id,
            "timestamp": log.timestamp,
            "details": {
                "detected_computers": log.detected_computers,
                "required_computers": log.required_computers,
                "compliance_percentage": log.compliance_percentage,
                "status": log.status,
            },
        })

    recent_activity.sort(
        key=lambda event: event["timestamp"] or "",
        reverse=True,
    )

    return {
        "success": True,
        "generated_at": datetime.now().astimezone().isoformat(),
        "summary": {
            "total_centres": total_centres,
            "safe_centres": safe_centres,
            "warning_centres": warning_centres,
            "high_risk_centres": high_risk_and_flagged,
            "flagged_centres": flagged_centres,
            "average_compliance_percentage": average_compliance,
            "attendance_coverage_percentage": attendance_coverage,
            "average_risk_score": average_risk_score,
            "total_officially_present": total_officially_present,
            "total_live_headcount": total_live_headcount,
            "total_attendance_gap": total_attendance_gap,
        },
        "status_breakdown": status_breakdown,
        "alerts": alert_summary,
        "attention_centres": attention_centres,
        "recent_activity": recent_activity[:10],
    }