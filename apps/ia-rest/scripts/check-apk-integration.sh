#!/bin/bash
# ia.rest — Validación pre-deploy APK↔Web
# Ejecutar antes de subir una nueva versión del APK
# Uso: bash scripts/check-apk-integration.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

check() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✅${NC} $desc"
  else
    echo -e "${RED}❌${NC} $desc"
    echo -e "   Buscar '${pattern}' en ${file}"
    ERRORS=$((ERRORS + 1))
  fi
}

warn() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✅${NC} $desc"
  else
    echo -e "${YELLOW}⚠️${NC}  $desc"
    WARNINGS=$((WARNINGS + 1))
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ia.rest — Checklist integración APK↔Web"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Archivos clave
MAIN="android/app/src/main/java/es/iarest/app/MainActivity.kt"
MANIFEST="android/app/src/main/AndroidManifest.xml"
EDGE="src/app/edge/page.tsx"
VERSION_JSON="public/app/version.json"
BUILD_GRADLE="android/app/build.gradle"

echo "── APK: Permisos ──────────────────────────"
check "RECORD_AUDIO en manifest"       "$MANIFEST"    "RECORD_AUDIO"
check "POST_NOTIFICATIONS en manifest" "$MANIFEST"    "POST_NOTIFICATIONS"
check "CAMERA en manifest"             "$MANIFEST"    "CAMERA"
check "requestAllPermissions() existe" "$MAIN"        "requestAllPermissions"

echo ""
echo "── APK: WebView setup ─────────────────────"
check "Carga /login (no landing)"      "$MAIN"        "iarest.es/login"
check "requestFocus() para toques"     "$MAIN"        "requestFocus"
check "shouldOverrideUrlLoading OK"    "$MAIN"        "iarest.es"
check "onPermissionRequest auto-grant" "$MAIN"        "request.grant"

echo ""
echo "── APK: PTT auricular ─────────────────────"
check "dispatchKeyEvent override"      "$MAIN"        "dispatchKeyEvent"
check "KEYCODE_HEADSETHOOK capturado"  "$MAIN"        "KEYCODE_HEADSETHOOK"
check "evaluateJavascript startPTT"    "$MAIN"        "startPTT"
check "evaluateJavascript stopPTT"     "$MAIN"        "stopPTT"
check "isNativeApp inyectado"          "$MAIN"        "isNativeApp"

echo ""
echo "── Web: Compatibilidad APK ────────────────"
check "window.startPTT expuesto"       "$EDGE"        "window.startPTT"
check "window.stopPTT expuesto"        "$EDGE"        "window.stopPTT"
check "isNativeApp salta MediaSession" "$EDGE"        "isNativeApp"
check "activateMediaSession omitida"   "$EDGE"        "isNativeApp"

echo ""
echo "── Versiones sincronizadas ────────────────"
# Extraer versión del JSON
JSON_VERSION=$(python3 -c "import json; print(json.load(open('$VERSION_JSON'))['version'])" 2>/dev/null)
# Extraer CURRENT_VERSION del Kotlin
KT_VERSION=$(grep "CURRENT_VERSION = " "$MAIN" | grep -o '[0-9]\+')
# Extraer versionCode del gradle
GRADLE_VERSION=$(grep "versionCode " "$BUILD_GRADLE" | grep -o '[0-9]\+')

if [ "$JSON_VERSION" = "$KT_VERSION" ]; then
  echo -e "${GREEN}✅${NC} version.json ($JSON_VERSION) == CURRENT_VERSION Kotlin ($KT_VERSION)"
else
  echo -e "${RED}❌${NC} version.json ($JSON_VERSION) != CURRENT_VERSION Kotlin ($KT_VERSION)"
  echo -e "   Actualizar CURRENT_VERSION en $MAIN a $JSON_VERSION"
  ERRORS=$((ERRORS + 1))
fi

if [ "$JSON_VERSION" = "$GRADLE_VERSION" ]; then
  echo -e "${GREEN}✅${NC} version.json ($JSON_VERSION) == versionCode gradle ($GRADLE_VERSION)"
else
  echo -e "${YELLOW}⚠️${NC}  version.json ($JSON_VERSION) != versionCode gradle ($GRADLE_VERSION)"
  WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "── TypeScript ─────────────────────────────"
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
  echo -e "${RED}❌${NC} Errores TypeScript detectados"
  ERRORS=$((ERRORS + 1))
else
  echo -e "${GREEN}✅${NC} TypeScript: 0 errores"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo -e "${GREEN}  ✅ Todo OK — listo para deploy${NC}"
elif [ $ERRORS -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  $WARNINGS warning(s) — revisar antes de deploy${NC}"
else
  echo -e "${RED}  ❌ $ERRORS error(s) críticos — NO hacer deploy${NC}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $ERRORS
