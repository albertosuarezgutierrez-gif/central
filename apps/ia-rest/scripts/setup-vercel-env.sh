#!/bin/bash
# ============================================================
# ia.rest · Setup Vercel Environment Variables
# Uso: VERCEL_TOKEN=xxx bash scripts/setup-vercel-env.sh
# ============================================================
# Obtén tu token en: https://vercel.com/account/tokens
# Ejecutar UNA VEZ tras clonar el proyecto o cuando cambien las keys

set -e

PROJECT_ID="prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo"
TEAM_ID="team_f4gPpt6dPuNcd5YyMt3q27uf"

if [ -z "$VERCEL_TOKEN" ]; then
  echo "❌ Falta VERCEL_TOKEN. Obtén uno en https://vercel.com/account/tokens"
  echo "   Uso: VERCEL_TOKEN=xxx bash scripts/setup-vercel-env.sh"
  exit 1
fi

# ── Helper para crear/actualizar env var ────────────────────
upsert_env() {
  local key="$1"
  local value="$2"
  local target="${3:-production,preview,development}"  # entornos donde aplica

  echo "  → $key"

  # Borrar si existe (ignora error si no existe)
  curl -s -o /dev/null -X DELETE \
    "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$key?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" 2>/dev/null || true

  # Crear
  curl -s -o /dev/null -X POST \
    "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"key\": \"$key\",
      \"value\": \"$value\",
      \"type\": \"encrypted\",
      \"target\": [\"production\", \"preview\", \"development\"]
    }"
}

echo ""
echo "ia.rest · Configurando env vars en Vercel..."
echo "Proyecto: $PROJECT_ID"
echo ""

# ── Pide las claves si no están en el entorno ────────────────
if [ -z "$GROQ_API_KEY" ]; then
  read -rp "GROQ_API_KEY (https://console.groq.com/keys): " GROQ_API_KEY
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  read -rp "SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API): " SUPABASE_SERVICE_ROLE_KEY
fi

# ── VAPID keys (Web Push) — NO hardcodear: se leen de env o se piden ──
if [ -z "$VAPID_PUBLIC" ]; then
  read -rp "VAPID_PUBLIC (clave pública Web Push): " VAPID_PUBLIC
fi
if [ -z "$VAPID_PRIVATE" ]; then
  read -rsp "VAPID_PRIVATE (clave privada Web Push): " VAPID_PRIVATE; echo
fi

# Supabase URLs (públicas, no secret).
# OJO: la URL apunta al proyecto VIVO actual (efncqyvhniaxsirhdxaa). La migración
# decidida al compartido (wswbehlcuxqxyinousql/schema iarest) cambia esto en la
# "Etapa D" del plan — NO tocar aquí hasta el flip, o este script fliparía prod.
SUPABASE_URL="${SUPABASE_URL:-https://efncqyvhniaxsirhdxaa.supabase.co}"
# El ANON key es público pero NO se hardcodea (antes había un placeholder que subía
# una key inválida a Vercel). Pásalo por env SUPABASE_ANON o se pide por teclado.
if [ -z "$SUPABASE_ANON" ]; then
  read -rp "SUPABASE_ANON (anon key pública, Supabase → Settings → API): " SUPABASE_ANON
fi

echo "Subiendo variables..."
upsert_env "GROQ_API_KEY"                    "$GROQ_API_KEY"
upsert_env "SUPABASE_SERVICE_ROLE_KEY"       "$SUPABASE_SERVICE_ROLE_KEY"
upsert_env "NEXT_PUBLIC_VAPID_PUBLIC_KEY"    "$VAPID_PUBLIC"
upsert_env "VAPID_PRIVATE_KEY"               "$VAPID_PRIVATE"
upsert_env "NEXT_PUBLIC_SUPABASE_URL"        "$SUPABASE_URL"
upsert_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"   "$SUPABASE_ANON"

echo ""
echo "✓ Variables subidas. Forzando redeploy..."

curl -s -o /dev/null -X POST \
  "https://api.vercel.com/v13/deployments?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"ia-rest\",\"project\":\"$PROJECT_ID\",\"target\":\"production\",\"source\":\"api\"}" || true

echo ""
echo "✓ Listo. Verifica en https://ia-rest.vercel.app/api/health"
echo ""
