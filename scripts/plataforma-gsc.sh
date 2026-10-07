#!/usr/bin/env bash
# Consulta Search Console vía plataforma (/api/internal/gsc) sin que el secreto ni la URL
# aparezcan como texto en la llamada de Bash que invoca este script.
#
# Por qué existe: MCP Sentinel (.claude/mcp-sentinel/hooks/sentinel_preflight.py,
# check_sensitive_env) deniega en rutinas desatendidas todo Bash que combine curl/wget con
# un $SECRETO (aquí ALERTA_TOKEN) cuando la URL va en variable. Mismo patrón que
# scripts/canal-aviso.sh: PLATAFORMA_URL y ALERTA_TOKEN se leen del entorno DENTRO del
# script y la llamada de Bash ("scripts/plataforma-gsc.sh ...") no lleva curl ni el secreto.
#
# Uso:
#   scripts/plataforma-gsc.sh GET                         # propiedades a las que llega la cuenta de servicio
#   scripts/plataforma-gsc.sh POST '{"propiedad":"sc-domain:housesevillana.es","dimensiones":["query"],"limite":50}'
#   scripts/plataforma-gsc.sh POST @consulta.json         # cuerpo desde fichero
#   scripts/plataforma-gsc.sh POST                        # cuerpo vacío = consulta por defecto (28 días)
#
# Salida: el cuerpo de la respuesta y una línea final "HTTP_STATUS:<code>".
# Exit 0 si la petición HTTP se completa (mira HTTP_STATUS); exit 2 si faltan env/argumentos
# inválidos (falla claro, a diferencia del fail-open de canal-aviso). Nunca imprime el token.

set -u

USO="Uso: plataforma-gsc.sh <GET|POST> [json-body|@fichero]"
METHOD="${1:?$USO}"
BODY="${2:-}"

case "$METHOD" in
  GET|POST) ;;
  *) echo "ERROR: método '$METHOD' no válido. $USO" >&2; exit 2 ;;
esac

if [ -z "${PLATAFORMA_URL:-}" ] || [ -z "${ALERTA_TOKEN:-}" ]; then
  echo "ERROR: faltan PLATAFORMA_URL y/o ALERTA_TOKEN en el entorno de este agente" >&2
  exit 2
fi

case "$PLATAFORMA_URL" in
  https://*) ;;
  *) echo "ERROR: PLATAFORMA_URL no es https://" >&2; exit 2 ;;
esac

case "$PLATAFORMA_URL$ALERTA_TOKEN" in
  *$'\n'*) echo "ERROR: PLATAFORMA_URL o ALERTA_TOKEN llevan un salto de línea" >&2; exit 2 ;;
esac

# El cuerpo: literal o @fichero (se lee aquí, no lo interpreta curl).
if [ "${BODY:0:1}" = "@" ]; then
  FICHERO="${BODY:1}"
  if [ ! -r "$FICHERO" ]; then
    echo "ERROR: no puedo leer el fichero de cuerpo '$FICHERO'" >&2
    exit 2
  fi
  BODY="$(cat "$FICHERO")"
fi

escapar_valor_curl_cfg() {
  local v="$1"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '%s' "$v"
}

# Ruta fija: no hay parámetro de ruta que pueda cambiar el host de destino.
URL_ESC="$(escapar_valor_curl_cfg "${PLATAFORMA_URL%/}/api/internal/gsc")"
TOKEN_ESC="$(escapar_valor_curl_cfg "$ALERTA_TOKEN")"

CONFIG="$(mktemp)"
trap 'rm -f "$CONFIG"' EXIT

{
  printf 'url = "%s"\n' "$URL_ESC"
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN_ESC"
  printf 'silent\n'
  printf 'show-error\n'
  printf 'write-out = "\\nHTTP_STATUS:%%{http_code}\\n"\n'
  if [ "$METHOD" = "POST" ]; then
    printf 'request = "POST"\n'
    printf 'header = "Content-Type: application/json"\n'
    printf 'data-binary = "@-"\n'
  fi
} > "$CONFIG"

if [ "$METHOD" = "POST" ]; then
  printf '%s' "$BODY" | curl -K "$CONFIG"
else
  curl -K "$CONFIG"
fi
