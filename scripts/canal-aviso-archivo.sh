#!/usr/bin/env bash
# Variante de canal-aviso.sh para payloads GRANDES: el cuerpo se lee de un FICHERO
# (para no reventar ARG_MAX pasándolo como argumento de shell) en vez de por $3.
# Mismas salvaguardas de canal-aviso.sh (PLATAFORMA_URL/ALERTA_TOKEN nunca en la
# llamada de Bash que invoca este script, RUTA validada, -K de curl con escapado).
#
# Uso:
#   scripts/canal-aviso-archivo.sh POST /api/trading/analizar /ruta/al/payload.json
#
# Salida: el cuerpo de la respuesta seguido de una línea "HTTP_STATUS:<code>".

set -u

METHOD="${1:?Uso: canal-aviso-archivo.sh <POST> <path> <fichero-body>}"
RUTA="${2:?Uso: canal-aviso-archivo.sh <POST> <path> <fichero-body>}"
BODY_FILE="${3:?Uso: canal-aviso-archivo.sh <POST> <path> <fichero-body>}"

if [ ! -f "$BODY_FILE" ]; then
  echo "HTTP_STATUS:000 (fichero de body no existe: $BODY_FILE)"
  exit 0
fi

if [ -z "${PLATAFORMA_URL:-}" ] || [ -z "${ALERTA_TOKEN:-}" ]; then
  echo "HTTP_STATUS:000 (PLATAFORMA_URL o ALERTA_TOKEN ausentes en el entorno de este agente)"
  exit 0
fi

case "$PLATAFORMA_URL" in
  https://*) ;;
  *)
    echo "HTTP_STATUS:000 (PLATAFORMA_URL no es https:// — se rechaza antes de construir nada)"
    exit 0
    ;;
esac

case "$RUTA" in
  //*)
    echo "HTTP_STATUS:000 (RUTA no puede empezar por // — sería una URL sin esquema, no un path)"
    exit 0
    ;;
  /*) ;;
  *)
    echo "HTTP_STATUS:000 (RUTA debe empezar por / — se rechaza antes de construir nada)"
    exit 0
    ;;
esac
case "$RUTA" in
  *@*|*://*)
    echo "HTTP_STATUS:000 (RUTA no puede contener @ ni :// — cambiaría el host de destino)"
    exit 0
    ;;
esac

case "$PLATAFORMA_URL$RUTA$ALERTA_TOKEN" in
  *$'\n'*)
    echo "HTTP_STATUS:000 (PLATAFORMA_URL, RUTA o ALERTA_TOKEN llevan un salto de línea)"
    exit 0
    ;;
esac

escapar_valor_curl_cfg() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '%s' "$v"
}

PLATAFORMA_URL_ESC="$(escapar_valor_curl_cfg "$PLATAFORMA_URL")"
RUTA_ESC="$(escapar_valor_curl_cfg "$RUTA")"
ALERTA_TOKEN_ESC="$(escapar_valor_curl_cfg "$ALERTA_TOKEN")"
BODY_FILE_ESC="$(escapar_valor_curl_cfg "$BODY_FILE")"

CONFIG="$(mktemp)"
trap 'rm -f "$CONFIG"' EXIT

{
  printf 'url = "%s%s"\n' "$PLATAFORMA_URL_ESC" "$RUTA_ESC"
  printf 'header = "Authorization: Bearer %s"\n' "$ALERTA_TOKEN_ESC"
  printf 'silent\n'
  printf 'show-error\n'
  printf 'write-out = "\\nHTTP_STATUS:%%{http_code}\\n"\n'
  if [ "$METHOD" = "POST" ]; then
    printf 'request = "POST"\n'
    printf 'header = "Content-Type: application/json"\n'
    printf 'data-binary = "@%s"\n' "$BODY_FILE_ESC"
  fi
} > "$CONFIG"

curl -K "$CONFIG"
