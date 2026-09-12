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


def _curl_cfg_quote(value: str) -> str:
    """Quote a value for curl's -K/--config format.

    Un salto de línea SIN escapar dentro de un valor rompe la línea del
    fichero de config y el resto se lee como una directiva curl nueva
    (verificado con curl real: un token con \\n se corta y la segunda mitad
    se interpreta como una cabecera HTTP más). Se escapan también \\r y \\t
    porque curl reconoce esas mismas secuencias dentro de comillas.
    """
    value = value.replace("\\", "\\\\").replace('"', '\\"')
    value = value.replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")
    return '"' + value + '"'


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
    # El token viaja a un endpoint propio: nunca en claro por HTTP.
    if not url.startswith("https://"):
        return
    # Un \r o \n crudo en la URL o el token permitiría inyectar una cabecera
    # HTTP extra: curl decodifica \r/\n dentro de las comillas del fichero de
    # config y el control byte crudo resultante se manda tal cual en la
    # cabecera (verificado con curl real: "Authorization: Bearer x\ny: z" se
    # envía como DOS cabeceras). Ninguno de los dos debería llevarlos nunca.
    if any(c in url for c in "\r\n") or any(c in token for c in "\r\n"):
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
    # a la llamada de la herramienta que sí importa. El token va por el
    # fichero de configuración de curl (-K -, leído de stdin), NUNCA como
    # argumento de la línea de comandos: un argv es visible para cualquiera
    # en la máquina vía `ps`/`/proc/<pid>/cmdline` mientras el proceso vive
    # (incluso metiéndolo dentro de un `bash -c "...exec curl..."`, porque
    # `exec` sustituye la imagen del proceso por la de curl con las
    # variables ya expandidas — probado y descartado en este mismo cambio).
    config = (
        f"url = {_curl_cfg_quote(url.rstrip('/') + '/api/internal/alerta')}\n"
        f"header = {_curl_cfg_quote(f'Authorization: Bearer {token}')}\n"
        f"header = {_curl_cfg_quote('Content-Type: application/json')}\n"
        f"data = {_curl_cfg_quote(body)}\n"
        'request = "POST"\n'
        "silent\nshow-error\nfail\n"
        "max-time = 5\n"
    )
    try:
        proc = subprocess.Popen(
            ["curl", "-K", "-"],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        proc.stdin.write(config.encode())
        proc.stdin.close()
    except Exception:
        # No se pudo ni arrancar curl (p.ej. binario ausente): libera el
        # marcador para que un motivo idéntico más tarde el mismo día
        # pueda reintentarlo, en vez de darlo por avisado sin haberlo hecho.
        marker.unlink(missing_ok=True)


def main() -> int:
    raw_input = sys.stdin.buffer.read()
    try:
        proc = subprocess.run(
            [sys.executable, str(PREFLIGHT)], input=raw_input, capture_output=True, timeout=8
        )
    except Exception:
        # Degrada como el propio motor ante fallos (fail-open, nunca cuelga ni
        # rompe la llamada de la herramienta): sin veredicto, se permite. No
        # solo el timeout: cualquier fallo al lanzar preflight (binario
        # movido, OSError por límite de recursos, etc.) debe degradar igual,
        # no propagar una excepción sin capturar que dejaría el hook sin
        # salida válida.
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
