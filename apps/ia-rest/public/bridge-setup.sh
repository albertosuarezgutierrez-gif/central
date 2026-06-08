#!/bin/bash
# ============================================================
# ia.rest · Bridge de impresoras — Mac / Linux / Raspberry Pi
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
GRAY='\033[0;90m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="$HOME/.ia-rest-bridge"
CONFIG_FILE="$INSTALL_DIR/config.env"
API="https://www.iarest.es"

echo ""
echo -e "${BOLD}  ia.rest · Bridge de impresoras${NC}"
echo -e "${GRAY}  ============================================${NC}"
echo ""

mkdir -p "$INSTALL_DIR"

# ── Config guardada ───────────────────────────────────────────
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
  echo -e "  Configuracion encontrada."
  echo -e "  Token: ${GRAY}${BRIDGE_TOKEN:0:8}...${NC}"
  echo ""
  read -p "  Usar esta configuracion? [s/n]: " USE_SAVED
  if [ "$USE_SAVED" != "s" ] && [ "$USE_SAVED" != "S" ]; then
    BRIDGE_TOKEN=""
  fi
fi

# ── Token ─────────────────────────────────────────────────────
if [ -z "$BRIDGE_TOKEN" ]; then
  echo -e "  ${BOLD}PASO 1 · Token del bridge${NC}"
  echo -e "  ${GRAY}Ve a www.iarest.es/owner → Config → Impresoras → Bridge local${NC}"
  echo ""
  read -p "  Token: " BRIDGE_TOKEN
  if [ -z "$BRIDGE_TOKEN" ]; then
    echo -e "  ${RED}[ERR] Token requerido.${NC}"; exit 1
  fi
  echo "BRIDGE_TOKEN=$BRIDGE_TOKEN" > "$CONFIG_FILE"
  echo "IAREST_API=$API" >> "$CONFIG_FILE"
  echo -e "  ${GREEN}[OK] Configuracion guardada.${NC}"
fi

# ── Node.js ───────────────────────────────────────────────────
echo ""
echo -e "  ${BOLD}PASO 2 · Comprobando Node.js${NC}"

if ! command -v node &> /dev/null; then
  echo -e "  ${YELLOW}[!] Node.js no encontrado. Instalando...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
      brew install node
    else
      echo -e "  Instala Homebrew primero: https://brew.sh"
      echo -e "  Luego ejecuta: brew install node"
      exit 1
    fi
  elif command -v apt-get &> /dev/null; then
    # Debian/Ubuntu/Raspberry Pi
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y nodejs
  else
    echo -e "  ${RED}[ERR] Instala Node.js manualmente desde nodejs.org${NC}"
    exit 1
  fi
fi

NODE_VER=$(node --version)
echo -e "  ${GREEN}[OK] Node.js $NODE_VER${NC}"

# ── Descargar bridge ──────────────────────────────────────────
echo ""
echo -e "  ${BOLD}PASO 3 · Descargando bridge${NC}"
curl -fsSL "$API/bridge-local.js" -o "$INSTALL_DIR/bridge-local.js" || \
curl -fsSL "https://raw.githubusercontent.com/albertosuarezgutierrez-gif/ia.rest/main/scripts/bridge-local.js" \
  -o "$INSTALL_DIR/bridge-local.js"
echo -e "  ${GREEN}[OK] Bridge descargado${NC}"

# ── Wizard de impresoras ──────────────────────────────────────
if [ ! -f "$INSTALL_DIR/.wizard_done" ]; then
  echo ""
  echo -e "  ${BOLD}PASO 4 · Buscar impresoras en red${NC}"
  echo -e "  ${GRAY}Escanea el puerto 9100 en tu red local${NC}"
  echo ""
  read -p "  Buscar impresoras ahora? [s/n]: " DO_SCAN

  if [ "$DO_SCAN" = "s" ] || [ "$DO_SCAN" = "S" ]; then
    # Detectar subnet
    if [[ "$OSTYPE" == "darwin"* ]]; then
      LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
    else
      LOCAL_IP=$(hostname -I | awk '{print $1}')
    fi

    if [ -z "$LOCAL_IP" ]; then
      echo -e "  ${YELLOW}[!] No se pudo detectar la red.${NC}"
    else
      SUBNET=$(echo "$LOCAL_IP" | cut -d. -f1-3)
      echo -e "  Escaneando $SUBNET.1 - $SUBNET.254 ..."
      FOUND_IPS=()
      for i in $(seq 1 254); do
        IP="$SUBNET.$i"
        (echo >/dev/tcp/$IP/9100) 2>/dev/null && FOUND_IPS+=("$IP") &
      done
      wait
      
      if [ ${#FOUND_IPS[@]} -eq 0 ]; then
        echo -e "  ${YELLOW}[!] No se encontraron impresoras.${NC}"
        read -p "  Introducir IP manualmente? [s/n]: " DO_MANUAL
        if [ "$DO_MANUAL" = "s" ]; then
          read -p "  IP de la impresora: " MANUAL_IP
          FOUND_IPS=("$MANUAL_IP")
        fi
      else
        echo -e "  ${GREEN}[OK] ${#FOUND_IPS[@]} impresora(s) encontrada(s)${NC}"
      fi

      for IP in "${FOUND_IPS[@]}"; do
        echo ""
        echo -e "  ${BOLD}Impresora en $IP${NC}"
        read -p "  Nombre (Enter para omitir): " NOMBRE
        if [ -z "$NOMBRE" ]; then continue; fi

        RESPONSE=$(curl -s -X POST "$API/api/bridge/register-printer" \
          -H "Content-Type: application/json" \
          -H "x-bridge-token: $BRIDGE_TOKEN" \
          -d "{\"ip_address\":\"$IP\",\"port\":9100,\"nombre\":\"$NOMBRE\",\"connection_type\":\"ip_local\"}")

        PRINTER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

        if [ -n "$PRINTER_ID" ]; then
          echo -e "  ${GREEN}[OK] Registrada: $NOMBRE ($IP)${NC}"
          # Test de impresion
          curl -s -X POST "$API/api/print" \
            -H "Content-Type: application/json" \
            -d "{\"trigger\":\"test\",\"impresora_id\":\"$PRINTER_ID\"}" > /dev/null
          echo -e "  ${GREEN}[OK] Ticket de prueba enviado${NC}"
        else
          echo -e "  ${RED}[ERR] Error al registrar${NC}"
        fi
      done
    fi

    touch "$INSTALL_DIR/.wizard_done"
  fi
fi

# ── Script de arranque ────────────────────────────────────────
LAUNCH_SCRIPT="$INSTALL_DIR/arrancar.sh"
cat > "$LAUNCH_SCRIPT" << LAUNCH
#!/bin/bash
export IAREST_API=$API
export BRIDGE_TOKEN=$BRIDGE_TOKEN
node "$INSTALL_DIR/bridge-local.js"
LAUNCH
chmod +x "$LAUNCH_SCRIPT"

# ── Abrir navegador ───────────────────────────────────────────
echo ""
echo -e "  ${GREEN}[OK] Bridge instalado correctamente${NC}"
echo -e "  Abriendo panel en el navegador..."

if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$API/owner?tab=flujos&setup=1" 2>/dev/null || true
else
  xdg-open "$API/owner?tab=flujos&setup=1" 2>/dev/null || true
fi

echo ""
echo -e "  ${BOLD}============================================${NC}"
echo -e "  Bridge listo. Arrancando..."
echo -e "  Ctrl+C para parar."
echo -e "  ${BOLD}============================================${NC}"
echo ""

export IAREST_API=$API
export BRIDGE_TOKEN=$BRIDGE_TOKEN
node "$INSTALL_DIR/bridge-local.js"
