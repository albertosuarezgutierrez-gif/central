#!/usr/bin/env python3
"""Sentinel: forwards PreToolUse to sentinel_preflight.py unchanged, and fires a
Telegram alert via plataforma's /api/internal/alerta when SENTINEL_SHADOW
downgraded a real ask/deny to allow. Best-effort: never blocks, never alters
the hook's own decision, fails silently if PLATAFORMA_URL/ALERTA_TOKEN are
missing or the endpoint is unreachable.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib import error, request

HERE = Path(__file__).resolve().parent
PREFLIGHT = HERE / "sentinel_preflight.py"


def maybe_alert(raw_input: bytes, out_bytes: bytes) -> None:
    if not out_bytes.strip():
        return
    data = json.loads(out_bytes)
    hso = data.get("hookSpecificOutput", {})
    if hso.get("permissionDecision") != "allow":
        return
    ctx = hso.get("additionalContext", "") or ""
    # El aviso de sombra es bilingüe (es/en); "SENTINEL_SHADOW" es el único
    # literal común a las dos plantillas (ver sentinel_preflight.py render("shadow", ...)).
    if "SENTINEL_SHADOW" not in ctx:
        return

    url = os.environ.get("PLATAFORMA_URL")
    token = os.environ.get("ALERTA_TOKEN")
    if not url or not token:
        return

    # Dedupe: mismo motivo, mismo día -> un solo aviso (evita spam en bucles).
    reason_hash = hashlib.sha256(ctx.encode()).hexdigest()[:16]
    day = time.strftime("%Y-%m-%d")
    marker_dir = Path.home() / ".claude" / "sentinel" / "alertas"
    marker_dir.mkdir(parents=True, exist_ok=True)
    marker = marker_dir / f"{day}-{reason_hash}"
    if marker.exists():
        return
    marker.write_text("1")

    try:
        tool_name = json.loads(raw_input).get("tool_name", "?")
    except Exception:
        tool_name = "?"
    text = f"\U0001F6E1️ Sentinel [SOMBRA] habría intervenido ({tool_name})\n{ctx[:500]}"
    body = json.dumps({"text": text}).encode()
    req = request.Request(
        f"{url.rstrip('/')}/api/internal/alerta",
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        request.urlopen(req, timeout=5)
    except error.URLError:
        pass


def main() -> int:
    raw_input = sys.stdin.buffer.read()
    proc = subprocess.run(
        [sys.executable, str(PREFLIGHT)], input=raw_input, capture_output=True, timeout=8
    )
    sys.stdout.buffer.write(proc.stdout)
    sys.stderr.buffer.write(proc.stderr)
    try:
        maybe_alert(raw_input, proc.stdout)
    except Exception:
        pass
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
