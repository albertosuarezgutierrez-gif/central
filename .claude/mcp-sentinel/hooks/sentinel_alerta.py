#!/usr/bin/env python3
"""Sentinel: forwards PreToolUse to sentinel_preflight.py unchanged, and fires a
Telegram alert via plataforma's /api/internal/alerta when SENTINEL_SHADOW
downgraded a real ask/deny to allow. Best-effort: never blocks (the alert is
sent by a detached subprocess so this hook never waits on the network), never
alters the hook's own decision, fails silently if PLATAFORMA_URL/ALERTA_TOKEN
are missing or the endpoint is unreachable.
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

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
    # Creación atómica (O_CREAT|O_EXCL) para que dos llamadas concurrentes con
    # el mismo motivo no pasen las dos el "no existe" antes de que ninguna escriba.
    reason_hash = hashlib.sha256(ctx.encode()).hexdigest()[:16]
    day = time.strftime("%Y-%m-%d")
    marker_dir = Path.home() / ".claude" / "sentinel" / "alertas"
    marker_dir.mkdir(parents=True, exist_ok=True)
    marker = marker_dir / f"{day}-{reason_hash}"
    try:
        fd = os.open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        return

    try:
        tool_name = json.loads(raw_input).get("tool_name", "?")
    except Exception:
        tool_name = "?"
    text = f"\U0001F6E1️ Sentinel [SOMBRA] habría intervenido ({tool_name})\n{ctx[:500]}"
    body = json.dumps({"text": text})

    # Fire-and-forget con curl en un proceso desatendido: este hook nunca
    # espera a la red, así que un PLATAFORMA_URL lento/caído no añade latencia
    # a la llamada de la herramienta que sí importa.
    try:
        subprocess.Popen(
            [
                "curl", "-fsS", "--max-time", "5",
                "-X", "POST", f"{url.rstrip('/')}/api/internal/alerta",
                "-H", f"Authorization: Bearer {token}",
                "-H", "Content-Type: application/json",
                "-d", body,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        pass


def main() -> int:
    raw_input = sys.stdin.buffer.read()
    try:
        proc = subprocess.run(
            [sys.executable, str(PREFLIGHT)], input=raw_input, capture_output=True, timeout=8
        )
    except subprocess.TimeoutExpired:
        # Degrada como el propio motor ante fallos (fail-open, nunca cuelga la
        # llamada de la herramienta): sin veredicto, se permite.
        sys.stdout.buffer.write(b"{}")
        return 0
    sys.stdout.buffer.write(proc.stdout)
    sys.stderr.buffer.write(proc.stderr)
    try:
        maybe_alert(raw_input, proc.stdout)
    except Exception:
        pass
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
