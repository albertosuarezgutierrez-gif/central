#!/usr/bin/env bash
# Descarga la tipografía Nunito (woff2) y la deja auto-alojada en ./fonts/.
# La web no carga Google Fonts en runtime: el .woff2 se sirve desde nuestro
# dominio, así que NO se transfiere ningún dato del visitante a terceros.
#
#   bash fetch-fonts.sh
#
# Dos fuentes en cascada (resiliencia: gwfh.mranftl.com suele dar 403/rate-limit
# y entonces la landing se desplegaba SIN tipografía corporativa → fuente del
# sistema):
#   1) google-webfonts-helper (gwfh.mranftl.com) — zip de woff2 latin.
#   2) Fallback: la CSS2 API de Google (fonts.googleapis.com → fonts.gstatic.com).
#      SOLO en build/local; el woff2 se guarda en ./fonts y se sirve desde
#      nuestro dominio → el visitante NUNCA contacta con Google.
#
# NO aborta si una fuente falla: descarga lo que pueda y degrada con aviso.
# Requiere: curl (y unzip para la vía gwfh).
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p fonts

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
WEIGHTS=(400 500 600 700 800 900)

# Fuente 1: google-webfonts-helper (zip con los woff2 del subset latin).
fetch_gwfh() {
  local TMP; TMP="$(mktemp -d)"
  local URL="https://gwfh.mranftl.com/api/fonts/nunito?download=zip&subsets=latin&variants=regular,500,600,700,800,900&formats=woff2"
  if curl -fsSL --max-time 30 "$URL" -o "$TMP/nunito.zip" \
       && unzip -o "$TMP/nunito.zip" -d "$TMP/nunito" >/dev/null 2>&1; then
    local variant src
    declare -A MAP=( [regular]=400 [500]=500 [600]=600 [700]=700 [800]=800 [900]=900 )
    for variant in regular 500 600 700 800 900; do
      src="$(ls "$TMP"/nunito/*-"$variant".woff2 2>/dev/null | head -1 || true)"
      [ -n "$src" ] && cp "$src" "fonts/nunito-${MAP[$variant]}.woff2"
    done
  fi
  rm -rf "$TMP"
}

# Fuente 2 (fallback): CSS2 API de Google → woff2 del subset latin de un peso.
fetch_google_one() {
  local w="$1" css url
  css="$(curl -fsSL --max-time 20 -A "$UA" "https://fonts.googleapis.com/css2?family=Nunito:wght@${w}&display=swap")" || return 1
  # El CSS trae bloques "/* subset */ @font-face{…}"; cogemos el woff2 que sigue
  # al marcador "/* latin */".
  url="$(printf '%s\n' "$css" | awk '/\/\* latin \*\//{f=1} f&&/url\(/{if(match($0,/https:[^)]+\.woff2/)){print substr($0,RSTART,RLENGTH);exit}}')"
  [ -n "$url" ] || return 1
  curl -fsSL --max-time 20 -A "$UA" "$url" -o "fonts/nunito-${w}.woff2" || return 1
}

echo "→ Nunito (woff2): intentando google-webfonts-helper…"
fetch_gwfh || echo "  ⚠ gwfh no disponible."

ok=0
for w in "${WEIGHTS[@]}"; do
  if [ ! -s "fonts/nunito-${w}.woff2" ]; then
    if fetch_google_one "$w"; then echo "  ✓ fonts/nunito-${w}.woff2 (google)"; else echo "  ⚠ sin peso ${w}"; fi
  else
    echo "  ✓ fonts/nunito-${w}.woff2 (gwfh)"
  fi
  [ -s "fonts/nunito-${w}.woff2" ] && ok=$((ok+1))
done

echo "✅ ${ok}/${#WEIGHTS[@]} pesos en ./fonts/."
if [ "$ok" -eq 0 ]; then
  echo "⚠ Sin fuentes: la landing degradará a la fuente del sistema (no rompe el deploy)."
fi
