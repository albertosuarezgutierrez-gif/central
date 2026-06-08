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

if [ -z "$ANTHROPIC_API_KEY" ]; then
  read -rp "ANTHROPIC_API_KEY (https://console.anthropic.com/api-keys): " ANTHROPIC_API_KEY
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  read -rp "SUPABASE_SERVICE_ROLE_KEY (Supabase → Settings → API): " SUPABASE_SERVICE_ROLE_KEY
fi

# ── VAPID keys (generadas — no cambiar salvo que regeneres) ──
VAPID_PUBLIC="BKLVkE3Cz7RjzFoSqOdmdXQOaRyoh6lNLPEtMNsA-xATgG-6q6MqbwA2NQkcRk5EWQLbpdaagD_o918fWOwmUbc"
VAPID_PRIVATE="HiqNXomOefV33fzBdpZkzHtqCi-rjjnLTZ_PQFSbFJ4"

# Supabase URLs (públicas, no secret)
SUPABASE_URL="${SUPABASE_URL:-https://efncqyvhniaxsirhdxaa.supabase.co}"
SUPABASE_ANON="${SUPABASE_ANON:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbmNxeXZobmlheHNpcmhkeGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.placeholder}"

echo "Subiendo variables..."
upsert_env "GROQ_API_KEY"                    "$GROQ_API_KEY"
upsert_env "ANTHROPIC_API_KEY"               "$ANTHROPIC_API_KEY"
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
