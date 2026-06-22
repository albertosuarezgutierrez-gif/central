#!/usr/bin/env bash
#
# setup-gmail-mcp.sh — materializa las credenciales OAuth del servidor MCP
# `gmail-adjuntos` (@gongrzhe/server-gmail-autoauth-mcp) en una sesión cloud de
# Claude Code web. El servidor lee dos ficheros de ~/.gmail-mcp/:
#   - gcp-oauth.keys.json : el OAuth Client (Desktop app) de Google Cloud.
#   - credentials.json    : el token guardado tras el `auth` interactivo LOCAL.
#
# Como el entorno cloud NO tiene almacén de secretos, esos dos JSON se inyectan
# como variables de entorno del entorno (Settings → Environment variables) y este
# script los vuelca a disco antes de que arranque el MCP.
#
# Variables esperadas (formato .env, sin comillas, JSON en una sola línea):
#   GMAIL_MCP_OAUTH_KEYS   = contenido íntegro de gcp-oauth.keys.json
#   GMAIL_MCP_CREDENTIALS  = contenido íntegro de credentials.json
#
# Cómo se ejecuta: apunta el "setup script" del entorno (Settings → Setup script)
# a este fichero, p. ej.:   bash scripts/setup-gmail-mcp.sh
#
set -euo pipefail

# Solo en sesiones cloud (en local ya tienes tus credenciales en ~/.gmail-mcp/).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "[setup-gmail-mcp] No es sesión cloud (CLAUDE_CODE_REMOTE != true); no hago nada."
  exit 0
fi

DEST="${HOME}/.gmail-mcp"
mkdir -p "$DEST"

if [ -n "${GMAIL_MCP_OAUTH_KEYS:-}" ]; then
  printf '%s' "$GMAIL_MCP_OAUTH_KEYS" > "$DEST/gcp-oauth.keys.json"
  chmod 600 "$DEST/gcp-oauth.keys.json"
  echo "[setup-gmail-mcp] Escrito $DEST/gcp-oauth.keys.json"
else
  echo "[setup-gmail-mcp] AVISO: falta GMAIL_MCP_OAUTH_KEYS; el conector de adjuntos no autenticará."
fi

if [ -n "${GMAIL_MCP_CREDENTIALS:-}" ]; then
  printf '%s' "$GMAIL_MCP_CREDENTIALS" > "$DEST/credentials.json"
  chmod 600 "$DEST/credentials.json"
  echo "[setup-gmail-mcp] Escrito $DEST/credentials.json"
else
  echo "[setup-gmail-mcp] AVISO: falta GMAIL_MCP_CREDENTIALS; el conector de adjuntos no autenticará."
fi
