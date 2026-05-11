#!/bin/bash
# ════════════════════════════════════════════════════════════════════
# ia.rest — Chequeo pre-release APK
# Ejecutar antes de cada nueva versión del APK:
#   bash scripts/check-apk-release.sh
# ════════════════════════════════════════════════════════════════════

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
WARNINGS=0

green() { echo -e "\033[32m✅ $1\033[0m"; }
red()   { echo -e "\033[31m❌ $1\033[0m"; ERRORS=$((ERRORS+1)); }
warn()  { echo -e "\033[33m⚠️  $1\033[0m"; WARNINGS=$((WARNINGS+1)); }
head()  { echo -e "\n\033[1m$1\033[0m"; }

head "══ ia.rest APK Pre-Release Check ══"

# ── 1. TypeScript ────────────────────────────────────────────────────
head "1. TypeScript"
TS_ERRORS=$(cd "$ROOT" && npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
[ "$TS_ERRORS" -eq 0 ] && green "0 errores TypeScript" || red "$TS_ERRORS errores TypeScript — corrige antes de hacer release"

# ── 2. Versiones sincronizadas ───────────────────────────────────────
head "2. Versiones APK"
APK_VER=$(python3 -c "import re; c=open('$ROOT/android/app/src/main/java/es/iarest/app/MainActivity.kt').read(); m=re.search(r'CURRENT_VERSION = ([0-9]+)', c); print(m.group(1) if m else '0')")
JSON_VER=$(python3 -c "import json; print(json.load(open('$ROOT/public/app/version.json'))['version'])")
GRADLE_VER=$(grep "versionCode" "$ROOT/android/app/build.gradle" | grep -o '[0-9]*')

echo "  MainActivity CURRENT_VERSION : $APK_VER"
echo "  public/app/version.json      : $JSON_VER"
echo "  android/app/build.gradle     : $GRADLE_VER"

if [ "$APK_VER" = "$JSON_VER" ] && [ "$APK_VER" = "$GRADLE_VER" ]; then
  green "Versiones consistentes (v$APK_VER)"
else
  red "VERSIONES DESINCRONIZADAS — actualiza los 3 archivos al mismo número"
fi

# ── 3. Contrato APK ↔ Web (window.isNativeApp) ───────────────────────
head "3. Contrato APK ↔ Web"

grep -q "isNativeApp = true" "$ROOT/android/app/src/main/java/es/iarest/app/MainActivity.kt" \
  && green "APK inyecta window.isNativeApp=true" \
  || red "APK NO inyecta window.isNativeApp — la MediaSession web interferirá con el PTT"

grep -q "isNativeApp" "$ROOT/src/app/edge/page.tsx" \
  && green "edge/page.tsx comprueba isNativeApp" \
  || red "edge/page.tsx no comprueba isNativeApp — conflicto MediaSession"

grep -q "window.startPTT" "$ROOT/src/app/edge/page.tsx" \
  && green "window.startPTT expuesto" \
  || red "window.startPTT no expuesto — botón auricular no funcionará"

grep -q "window.stopPTT" "$ROOT/src/app/edge/page.tsx" \
  && green "window.stopPTT expuesto" \
  || red "window.stopPTT no expuesto — botón auricular no funcionará"

# ── 4. Permisos ──────────────────────────────────────────────────────
head "4. Permisos Android"
MANIFEST="$ROOT/android/app/src/main/AndroidManifest.xml"
MAIN="$ROOT/android/app/src/main/java/es/iarest/app/MainActivity.kt"

for PERM in RECORD_AUDIO POST_NOTIFICATIONS CAMERA READ_MEDIA_IMAGES; do
  IN_MANIFEST=$(grep -c "$PERM" "$MANIFEST" || true)
  IN_MAIN=$(grep -c "$PERM" "$MAIN" || true)
  if [ "$IN_MANIFEST" -gt 0 ] && [ "$IN_MAIN" -gt 0 ]; then
    green "$PERM (manifest + MainActivity)"
  elif [ "$IN_MANIFEST" -gt 0 ]; then
    warn "$PERM en manifest pero no se solicita en MainActivity"
  else
    red "$PERM falta en manifest"
  fi
done

# ── 5. Archivos críticos presentes ───────────────────────────────────
head "5. Archivos críticos"
FILES=(
  "android/app/src/main/java/es/iarest/app/MainActivity.kt"
  "android/app/src/main/AndroidManifest.xml"
  "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"
  "android/app/build.gradle"
  "android/settings.gradle"
  "android/gradle.properties"
  "android/gradle/wrapper/gradle-wrapper.properties"
  "public/app/version.json"
  "src/app/app/route.ts"
)
for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] && green "$f" || red "$f — FALTA"
done

# ── 6. version.json tiene URL correcta ──────────────────────────────
head "6. version.json"
JSON_URL=$(python3 -c "import json; print(json.load(open('$ROOT/public/app/version.json')).get('url',''))")
echo "  URL: $JSON_URL"
[[ "$JSON_URL" == *"github.com"*"iarest.apk" ]] \
  && green "URL del APK válida" \
  || red "URL del APK incorrecta en version.json"

NOTES=$(python3 -c "import json; print(json.load(open('$ROOT/public/app/version.json')).get('notes',''))")
[ -n "$NOTES" ] && green "Notas de versión presentes: \"$NOTES\"" || warn "Sin notas de versión en version.json"

# ── 7. .gitignore Android ───────────────────────────────────────────
head "7. .gitignore Android"
GITIGNORE="$ROOT/android/.gitignore"
[ -f "$GITIGNORE" ] && grep -q "build/" "$GITIGNORE" \
  && green ".gitignore excluye build/" \
  || red ".gitignore Android no excluye build/ — se commitearán archivos de compilación"

# ── Resumen ──────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════"
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "\033[32m🚀 TODO OK — listo para hacer release\033[0m"
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "\033[33m⚠️  $WARNINGS advertencias — revisar antes de release\033[0m"
else
  echo -e "\033[31m❌ $ERRORS errores, $WARNINGS advertencias — NO hacer release hasta corregir\033[0m"
  exit 1
fi
echo "════════════════════════════════════"
