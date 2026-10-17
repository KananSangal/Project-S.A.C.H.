#!/usr/bin/env python3
"""
Simulate Dev 1 (Attendance Headcount) and Dev 2 (Equipment Audit) packets
for testing the SACH dashboard without waiting for external hardware.
Uses standard library urllib (no extra dependencies required).
"""
import json
import urllib.request
from datetime import datetime

API_URL = "http://127.0.0.1:8000/api"

def _post_json(endpoint: str, data: dict):
    url = f"{API_URL}/{endpoint}"
    payload = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def simulate_dev1_attendance(centre_id="DELHI_001", headcount=14):
    payload = {
        "centre_id": centre_id,
        "live_headcount": headcount,
        "timestamp": datetime.now().isoformat()
    }
    try:
        status, body = _post_json("attendance/log", payload)
        print(f"[Dev 1 Simulated] Headcount {headcount} for {centre_id} -> HTTP {status}")
    except Exception as e:
        print(f"[Dev 1 Error] {e}")

def simulate_dev2_audit(centre_id="DELHI_001", detected=15, required=15):
    compliance = round((detected / required) * 100, 1) if required > 0 else 100.0
    payload = {
        "centre_id": centre_id,
        "detected_computers": detected,
        "required_computers": required,
        "compliance_percentage": compliance,
        "status": "PASS" if compliance >= 80 else "REVIEW"
    }
    try:
        status, body = _post_json("audit/submit", payload)
        print(f"[Dev 2 Simulated] Audit for {centre_id} ({compliance}%) -> HTTP {status}")
    except Exception as e:
        print(f"[Dev 2 Error] {e}")

if __name__ == "__main__":
    print("Simulating live packets from Dev 1 & Dev 2...")
    simulate_dev1_attendance("DELHI_001", 13)
    simulate_dev2_audit("DELHI_001", 15, 15)
    print("\nCheck your dashboard at http://localhost:5173 to see the live updates!")
