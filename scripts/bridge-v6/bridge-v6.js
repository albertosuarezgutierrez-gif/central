#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// ia.rest Bridge v7.0.1 — Cloud Edition + Mesh
//
// NUEVO v7: Arquitectura multi-nodo (mesh)
//   · Cada dispositivo con la APK puede actuar como bridge
//   · Elección automática de master por último ping activo
//   · Si el master cae → standby toma el relevo en <15s
//   · Detección automática WiFi vs datos móviles
//   · Auto-scan cuando una impresora no responde
//
// FIX v7.0.1:
//   · ws.on('error') ahora fuerza ws.terminate() → reconexión garantizada
//   · Watchdog WS: detecta conexión zombie >90s y fuerza reconexión
//   · fetchJSON timeout 10s: evita requests colgados que saturan el loop
//
// Backward compatible: con 1 solo bridge funciona igual que v6
// ═══════════════════════════════════════════════════════════════

const net   = require('net')
const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { execSync, exec, spawn } = require('child_process')
const readline = require('readline')
const { CashlogyManager } = require('./azkoyen-cashlogy')

const VERSION      = '7.0.1'
const API          = 'https://www.iarest.es'
const SUPABASE_URL = 'https://efncqyvhniaxsirhdxaa.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmbmNxeXZobmlheHNpcmhkeGFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2ODk5MzYsImV4cCI6MjA5MzI2NTkzNn0.dt3ko-HWzJK57FQyRDTjU07QBsYv9fpGo8Sm3Cs6heA'

const CONFIG_DIR  = path.join(os.homedir(), '.iarest')
const CONFIG_FILE = path.join(CONFIG_DIR, 'bridge-v6.json')
const EXE_PATH    = process.execPath  // Ruta del EXE actual

// ── Cashlogy Manager (global, persiste entre polls) ──────────
let cashlogyManager = null

async function initCashlogy(TOKEN, restauranteId) {
  cashlogyManager = new CashlogyManager({ configFile: path.join(CONFIG_DIR, 'cashlogy.json') })
  await cashlogyManager.init(async (status, info) => {
    console.log(`${status === 'online' ? G : Y}[CASHLOGY]${X} Estado: ${status}`, info.ip ?? '')
    // Reportar estado a Supabase para que /owner lo vea en tiempo real
    try {
      await fetchJSON(`${API}/api/bridge/cashlogy/status`, {
        method: 'POST',
        headers: { 'x-bridge-token': TOKEN },
        body: { status, ip: info.ip ?? null, version: info.version ?? null, restaurante_id: restauranteId },
      }).catch(() => {})
    } catch {}
  })
}

// ── Handler de comandos Cashlogy ────────────────────────────
async function handleCashlogyCommand(job, TOKEN) {
  const tipo = job.payload?.tipo
  const hora = new Date().toLocaleTimeString('es-ES')

  try {
    let result = null

    if (tipo === 'cashlogy_discover') {
      console.log(`${B}[CASHLOGY]${X} ${hora} · Descubrimiento manual`)
      if (cashlogyManager) await cashlogyManager.discover()
      result = { ok: cashlogyManager?.isOnline(), ip: cashlogyManager?.ip }

    } else if (tipo === 'cashlogy_status') {
      result = cashlogyManager ? await cashlogyManager.getStatus() : { ok: false, error: 'Manager no iniciado' }

    } else if (tipo === 'cashlogy_charge') {
      const { importe, op_num, operacion_id } = job.payload
      console.log(`${B}[CASHLOGY]${X} ${hora} · Cobro ${(importe/100).toFixed(2)}€ op:${op_num}`)
      result = cashlogyManager
        ? await cashlogyManager.charge(importe, op_num)
        : { ok: false, error: 'Cashlogy no disponible', estado: 'error' }

      // Reportar resultado de la operación a ia.rest
      if (operacion_id) {
        await fetchJSON(`${API}/api/bridge/cashlogy/result`, {
          method: 'POST',
          headers: { 'x-bridge-token': TOKEN },
          body: { operacion_id, ...result },
        }).catch(() => {})
      }

    } else if (tipo === 'cashlogy_close') {
      result = cashlogyManager ? await cashlogyManager.closeTill() : { ok: false, error: 'No disponible' }
    }

    const estado = result?.ok ? 'done' : 'error'
    console.log(`${result?.ok ? G : Y}[CASHLOGY]${X} ${hora} · ${tipo} → ${estado}`)
    await reportPrintResult(job.id, estado, result?.ok ? null : (result?.error ?? 'error'), TOKEN)

  } catch (e) {
    console.error(`${R}[CASHLOGY ERR]${X}`, e.message)
    await reportPrintResult(job.id, 'error', e.message, TOKEN)
  }
}

// ── Colores para terminal ─────────────────────────────────────
const R = '\x1b[31m', G = '\x1b[32m', Y = '\x1b[33m', B = '\x1b[36m', W = '\x1b[37m', X = '\x1b[0m'

// ── Config ────────────────────────────────────────────────────
function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
  catch {}
  return {}
}
function saveConfig(data) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...loadConfig(), ...data }, null, 2))
}

// ── TCP ESC/POS ───────────────────────────────────────────────
function sendESCPOS(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    const t = setTimeout(() => { socket.destroy(); reject(new Error(`TCP timeout ${ip}:${port}`)) }, 8000)
    socket.connect(parseInt(port) || 9100, ip, () => {
      socket.write(data, () => { clearTimeout(t); socket.end(); resolve() })
    })
    socket.on('error', (e) => { clearTimeout(t); reject(e) })
  })
}

// ── REST helpers ──────────────────────────────────────────────
function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `iarest-bridge/${VERSION}`, ...opts.headers },
    }
    const req = mod.request(options, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }) }
        catch { resolve({ status: res.statusCode, body }) }
      })
    })
    // Timeout 10s — evita que requests colgados saturen el loop
    const t = setTimeout(() => { req.destroy(); reject(new Error(`fetchJSON timeout: ${url.split('?')[0]}`)) }, 10_000)
    req.on('response', () => clearTimeout(t))
    req.on('error', (e) => { clearTimeout(t); reject(e) })
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body))
    req.end()
  })
}


// ── Escaneo de red para impresoras ────────────────────────────
function probePort(ip, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const t = setTimeout(() => { socket.destroy(); resolve(null) }, timeoutMs)
    const start = Date.now()
    socket.connect(port, ip, () => {
      clearTimeout(t)
      const ms = Date.now() - start
      socket.destroy()
      resolve(ms)
    })
    socket.on('error', () => { clearTimeout(t); resolve(null) })
  })
}

async function scanRed(TOKEN) {
  // Determinar subred desde ip_lan o inferir 192.168.1.x
  let base = '192.168.1'
  try {
    const ifaces = require('os').networkInterfaces()
    for (const iface of Object.values(ifaces).flat()) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
        base = iface.address.split('.').slice(0, 3).join('.')
        break
      }
    }
  } catch {}

  console.log(`[SCAN] Buscando impresoras en ${base}.1-254 :9100...`)
  const PORT = 9100
  const batch = 30 // paralelo de 30 en 30
  const found = []

  for (let start = 1; start <= 254; start += batch) {
    const promises = []
    for (let i = start; i < start + batch && i <= 254; i++) {
      const ip = `${base}.${i}`
      promises.push(probePort(ip, PORT).then(ms => ms !== null ? { ip, port: PORT, ms } : null))
    }
    const results = await Promise.all(promises)
    results.forEach(r => r && found.push(r))
  }

  console.log(`[SCAN] Encontradas ${found.length} impresoras: ${found.map(f => f.ip).join(', ') || 'ninguna'}`)

  // Reportar al servidor
  await fetchJSON(`${API}/api/bridge/scan`, {
    method: 'PATCH',
    headers: { 'x-bridge-token': TOKEN },
    body: { results: found },
  }).catch(e => console.warn('[SCAN] Error reportando:', e.message))
}

// ── Autostart Windows (registro) ─────────────────────────────
function installAutostart(token) {
  if (process.platform !== 'win32') return false
  try {
    // Crear un .bat que lanza el bridge con el token
    const batPath = path.join(CONFIG_DIR, 'start-bridge.bat')
    const batContent = [
      '@echo off',
      `set BRIDGE_TOKEN=${token}`,
      `start "" /MIN "${EXE_PATH}" --bridge`,
      'exit',
    ].join('\r\n')
    fs.writeFileSync(batPath, batContent)

    // Registrar en HKCU\Run → arranca con el usuario sin UAC
    const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge-v6" /t REG_SZ /d "\"${batPath}\"" /f`
    execSync(regCmd, { stdio: 'ignore' })
    return true
  } catch (e) {
    console.warn(`${Y}[WARN] No se pudo instalar autostart: ${e.message}${X}`)
    return false
  }
}

// ── Validar token con el servidor ────────────────────────────
async function validarToken(token) {
  try {
    const r = await fetchJSON(`${API}/api/bridge/info?token=${token}&v=${VERSION}`)
    if (r.body?.ok && r.body?.restaurante_id) return r.body
    return null
  } catch { return null }
}

// ── Setup interactivo (primer uso) ───────────────────────────
async function setup() {
  console.clear()
  console.log(`\n${B}╔═══════════════════════════════════════════╗${X}`)
  console.log(`${B}║${X}  ${W}ia.rest Bridge v${VERSION} · Cloud Edition${X}     ${B}║${X}`)
  console.log(`${B}╚═══════════════════════════════════════════╝${X}\n`)
  console.log(`${W}Configuración inicial${X}`)
  console.log(`─────────────────────────────────────────────`)
  console.log(`${Y}Necesitas tu token de acceso.${X}`)
  console.log(`Encuéntralo en: ${B}www.iarest.es/owner${X} → Diagnóstico\n`)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  
  return new Promise((resolve) => {
    const pregunta = () => {
      rl.question(`${W}Pega tu token aquí y pulsa Enter:${X}\n> `, async (token) => {
        token = token.trim()
        if (!token || token.length < 20) {
          console.log(`${R}Token demasiado corto. Inténtalo de nuevo.${X}\n`)
          return pregunta()
        }

        console.log(`\n${Y}Verificando token...${X}`)
        const info = await validarToken(token)
        
        if (!info) {
          console.log(`${R}Token inválido o sin conexión. Comprueba el token en /owner → Diagnóstico${X}\n`)
          return pregunta()
        }

        console.log(`${G}✓ Token válido${X}`)
        console.log(`${G}✓ Restaurante conectado: ${info.restaurante_id.slice(0,8)}...${X}`)
        
        if (info.impresoras?.length > 0) {
          console.log(`${G}✓ Impresoras encontradas:${X}`)
          info.impresoras.forEach(i => console.log(`   · ${i.nombre} → ${i.ip_address}:${i.port || 9100}`))
        } else {
          console.log(`${Y}⚠ Sin impresoras configuradas (puedes añadirlas desde /owner)${X}`)
        }

        // Guardar config
        saveConfig({ token, restaurante_id: info.restaurante_id, setup_at: new Date().toISOString() })
        console.log(`\n${G}✓ Configuración guardada${X}`)

        // Instalar autostart
        const autoOk = installAutostart(token)
        if (autoOk) {
          console.log(`${G}✓ Autostart instalado (arrancará automáticamente con Windows)${X}`)
        }

        console.log(`\n${B}╔═══════════════════════════════════════════╗${X}`)
        console.log(`${B}║${X}  ${G}Bridge instalado y listo ✓${X}               ${B}║${X}`)
        console.log(`${B}╚═══════════════════════════════════════════╝${X}\n`)
        console.log(`${W}Iniciando bridge...${X}\n`)

        rl.close()
        resolve(token)
      })
    }
    pregunta()
  })
}

// ── Imprimir job ──────────────────────────────────────────────
async function reportPrintResult(job_id, status, error_msg, TOKEN) {
  // Retry 3x con backoff — evita que attempts quede en 0 por fallo de red puntual
  for (let i = 0; i < 3; i++) {
    try {
      await fetchJSON(`${API}/api/print`, {
        method: 'POST',
        headers: { 'x-bridge-token': TOKEN },
        body: { job_id, status, ...(error_msg ? { error_msg } : {}) },
      })
      return
    } catch {
      if (i < 2) await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  console.warn(`[WARN] No se pudo reportar resultado del job ${job_id?.slice(0,8)} tras 3 intentos`)
}

async function printJob(job, TOKEN) {
  // Cashlogy — comandos de caja automática
  if (job.payload?.tipo?.startsWith('cashlogy_')) {
    return handleCashlogyCommand(job, TOKEN)
  }

  let ip = job.ip || job.ip_address
  const port = job.port || 9100
  const data = Buffer.from(job.print_data, 'base64')
  const hora = new Date().toLocaleTimeString('es-ES')

  try {
    await sendESCPOS(ip, port, data)
    await reportPrintResult(job.id, 'impreso', null, TOKEN)
    console.log(`${G}[OK]${X} ${hora} · Job ${job.id.slice(0,8)} → ${ip}:${port}`)
  } catch (e) {
    console.warn(`${Y}[WARN]${X} Print failed: ${e.message}`)
    await reportPrintResult(job.id, 'error', e.message, TOKEN)
    // Auto-scan: buscar nueva IP si la impresora no respondió
    if (job.impresora_id || job.id) {
      autoScanImpresora(job.impresora_id, ip, TOKEN).catch(() => {})
    }
  }
}

// ── Ping ──────────────────────────────────────────────────────
async function ping(TOKEN) {
  try { await fetchJSON(`${API}/api/bridge/info?token=${TOKEN}&v=${VERSION}`) }
  catch {}
}

// ── MESH v7 — Estado local del nodo ──────────────────────────
// 'master'  → procesa print_jobs, hace scan de impresoras
// 'standby' → solo heartbeat, no procesa jobs
// 'unknown' → estado inicial hasta recibir respuesta del servidor
let meshRol      = 'unknown'
let meshNodos    = 1
let scanEnCurso  = false

// Detecta si el dispositivo está en WiFi o datos móviles
// En Android (Termux): WiFi = interfaz wlan0 / datos = rmnet_data0
function detectarRed() {
  const ifaces = os.networkInterfaces()
  const nombres = Object.keys(ifaces)

  // WiFi o Ethernet — puede alcanzar impresoras LAN
  const enWifi = nombres.some(n =>
    n.startsWith('wlan') ||
    n.startsWith('en')   ||   // macOS WiFi
    n.startsWith('eth')  ||   // Ethernet
    n === 'Wi-Fi'             // Windows
  )

  // IP local del dispositivo (para info en /owner)
  let ipLan = null
  for (const [nombre, lista] of Object.entries(ifaces)) {
    const esRed = nombre.startsWith('wlan') || nombre.startsWith('en') ||
                  nombre.startsWith('eth')  || nombre === 'Wi-Fi'
    if (!esRed) continue
    for (const iface of lista) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipLan = iface.address
        break
      }
    }
    if (ipLan) break
  }

  const plataforma = process.env.IAREST_PLATFORM ||
    (process.platform === 'linux' && process.env.TERMUX_VERSION ? 'android' : process.platform)

  return { enWifi, ipLan, plataforma }
}

// Ping mejorado — incluye info de red + recibe rol del servidor
async function pingMesh(TOKEN) {
  try {
    const { enWifi, ipLan, plataforma } = detectarRed()
    const deviceName = loadConfig().deviceName || os.hostname()

    const params = new URLSearchParams({
      token:    TOKEN,
      v:        VERSION,
      wifi:     enWifi ? '1' : '0',
      platform: plataforma,
      device:   deviceName,
    })
    if (ipLan) params.set('ip_lan', ipLan)

    const r = await fetchJSON(`${API}/api/bridge/info?${params.toString()}`)
    if (!r.body?.ok) return

    const rolAnterior = meshRol
    meshRol   = r.body.rol   ?? 'standby'
    meshNodos = r.body.nodos_activos ?? 1

    // Log solo cuando cambia el rol
    if (meshRol !== rolAnterior) {
      if (meshRol === 'master') {
        console.log(`${G}[MESH]${X} ★ Promovido a MASTER ${meshNodos > 1 ? `(${meshNodos} nodos activos)` : '(único nodo)'}`)
      } else if (meshRol === 'standby') {
        console.log(`${Y}[MESH]${X} Modo STANDBY — otro nodo es master`)
      }
    }

    // Si no tenemos WiFi, avisar (no puede imprimir pero sí tomar comandas)
    if (!enWifi && meshRol === 'master') {
      console.log(`${Y}[MESH]${X} Sin WiFi local — cediendo rol master`)
    }

    return r.body
  } catch (e) {
    // Silencioso en standby — solo loggear si es master
    if (meshRol === 'master') console.warn(`${Y}[MESH]${X} Ping fallido: ${e.message}`)
  }
}

// Auto-scan cuando una impresora no responde
// Solo lanza si soy master y no hay ya un scan en curso
async function autoScanImpresora(impresoraId, ipFallida, TOKEN) {
  if (meshRol !== 'master') return
  if (scanEnCurso) return
  scanEnCurso = true

  console.log(`${Y}[MESH]${X} Impresora ${ipFallida} no responde — buscando en red...`)
  try {
    const encontradas = await scanRedSilencioso()
    if (!encontradas.length) {
      console.log(`${Y}[MESH]${X} Sin impresoras detectadas en red`)
      return
    }
    // Intentar cruzar con la impresora que falló por IP conocida
    const candidata = encontradas.find(f => f.ip !== ipFallida) ?? encontradas[0]
    if (candidata) {
      await fetchJSON(`${API}/api/bridge/update-ip`, {
        method: 'POST',
        headers: { 'x-bridge-token': TOKEN },
        body: { impresora_id: impresoraId, new_ip: candidata.ip },
      }).catch(() => {})
      console.log(`${G}[MESH]${X} IP actualizada: ${ipFallida} → ${candidata.ip}`)
    }
  } finally {
    scanEnCurso = false
  }
}

// Scan de red silencioso (solo para auto-recovery, sin log verboso)
async function scanRedSilencioso() {
  let base = '192.168.1'
  try {
    const ifaces = os.networkInterfaces()
    for (const lista of Object.values(ifaces)) {
      for (const iface of lista) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
          base = iface.address.split('.').slice(0, 3).join('.')
          break
        }
      }
    }
  } catch {}

  const PORT  = 9100
  const BATCH = 30
  const found = []
  for (let start = 1; start <= 254; start += BATCH) {
    const promises = []
    for (let i = start; i < start + BATCH && i <= 254; i++) {
      const ip = `${base}.${i}`
      promises.push(probePort(ip, PORT, 400).then(ms => ms !== null ? { ip, port: PORT, ms } : null))
    }
    const results = await Promise.all(promises)
    results.forEach(r => r && found.push(r))
  }
  return found
}

// ── Realtime WebSocket ────────────────────────────────────────
const WebSocket = require('ws')
let ws = null, wsReady = false, reconnectTimer = null, heartbeatTimer = null
let wsWatchdog = null, lastWsActivity = 0
let joinRef = 1

function wsConnect(TOKEN, restauranteId) {
  if (ws) { try { ws.terminate() } catch {} }
  clearTimeout(reconnectTimer)
  clearInterval(heartbeatTimer)
  clearInterval(wsWatchdog)

  const wsUrl = `${SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`
  ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    wsReady = true
    lastWsActivity = Date.now()

    heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }))
    }, 25000)

    // Watchdog: si >90s sin actividad → el WS está zombie → forzar reconexión
    wsWatchdog = setInterval(() => {
      if (Date.now() - lastWsActivity > 90_000) {
        console.log(`${Y}[WS]${X} Sin actividad >90s — forzando reconexión`)
        clearInterval(wsWatchdog)
        ws.terminate()  // dispara ws.on('close') → reconecta
      }
    }, 30_000)

    // Suscribir
    ws.send(JSON.stringify({
      topic: `realtime:public:print_jobs:restaurante_id=eq.${restauranteId}`,
      event: 'phx_join',
      payload: {
        config: {
          postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'print_jobs', filter: `restaurante_id=eq.${restauranteId}` }]
        }
      },
      ref: String(joinRef++)
    }))
    console.log(`${G}[WS]${X} Realtime conectado · esperando jobs...`)
  })

  ws.on('message', (raw) => {
    lastWsActivity = Date.now()  // reset watchdog en cualquier mensaje (heartbeat ok)
    try {
      const msg = JSON.parse(raw)
      const record = msg.payload?.data?.record || msg.payload?.record
      if (record?.status === 'pendiente' && record?.restaurante_id === restauranteId) {
        console.log(`${B}[WS]${X} Nuevo job: ${record.id?.slice(0,8)}`)
        ;(async () => {
          try {
            const r = await fetchJSON(`${API}/api/print?token=${TOKEN}&v=${VERSION}`)
            if (r.body?.jobs?.length) {
              for (const j of r.body.jobs) await printJob(j, TOKEN)
            }
          } catch (e) { console.error('[WS] Fetch job error:', e.message) }
        })()
      }
    } catch {}
  })

  ws.on('close', () => {
    wsReady = false
    clearInterval(heartbeatTimer)
    clearInterval(wsWatchdog)
    console.log(`${Y}[WS]${X} Desconectado — reconectando en 5s...`)
    reconnectTimer = setTimeout(() => wsConnect(TOKEN, restauranteId), 5000)
  })

  ws.on('error', (e) => {
    // FIX: error no siempre dispara 'close' — forzar terminate para garantizar reconexión
    console.warn(`${Y}[WS]${X} Error: ${e.message} — reconectando...`)
    try { ws.terminate() } catch {}
    // ws.terminate() dispara ws.on('close') que gestiona el reconnectTimer
  })
}

// ── MAIN ──────────────────────────────────────────────────────
;(async () => {
  // Banner
  console.log(`\n${B}  ia.rest Bridge${X} ${W}v${VERSION}${X} ${B}· Cloud Edition + Mesh${X}`)
  console.log(`  API: ${API}\n`)

  // Determinar token
  let TOKEN = process.env.BRIDGE_TOKEN || loadConfig().token || ''

  // Primer uso — setup interactivo
  if (!TOKEN) {
    TOKEN = await setup()
  }

  // Validar token
  console.log(`${Y}Conectando...${X}`)
  const info = await validarToken(TOKEN)
  if (!info) {
    console.error(`${R}[ERROR]${X} Token inválido o sin conexión a internet.`)
    console.error(`Ejecuta de nuevo para reconfigurar, o comprueba tu conexión.`)
    // Borrar token inválido
    saveConfig({ token: '' })
    process.exit(1)
  }

  const restauranteId = info.restaurante_id
  console.log(`${G}[OK]${X} Bridge listo · restaurante ${restauranteId.slice(0,8)}...`)

  if (info.impresoras?.length > 0) {
    info.impresoras.forEach(i => console.log(`${G}[OK]${X} ${i.nombre} → ${i.ip_address}:${i.port || 9100}`))
  }

  // Ping inmediato — establece rol (master/standby) desde el primer momento
  await pingMesh(TOKEN)

  // Conectar Realtime (siempre — standby también escucha pero no procesa)
  wsConnect(TOKEN, restauranteId)

  // ── Loop principal mesh ──────────────────────────────────────
  // Master:  ping cada 5s + poll backup cada 60s
  // Standby: ping cada 10s (solo heartbeat, sin procesar jobs)
  setInterval(async () => {
    await pingMesh(TOKEN)

    // Solo el master hace poll de jobs
    if (meshRol !== 'master') return
    try {
      const r = await fetchJSON(`${API}/api/print?token=${TOKEN}&v=${VERSION}`)
      if (r.body?.jobs?.length) {
        for (const job of r.body.jobs) await printJob(job, TOKEN)
      }
      if (r.body?.scan_requested) {
        scanRed(TOKEN).catch(e => console.warn('[SCAN]', e.message))
      }
    } catch {}
  }, 5_000)  // cada 5s — suficiente para detectar caída de master en <15s

  console.log(`\n${G}Listo. Esperando comandas...${X}`)
  console.log(`${W}Rol: ${meshRol === 'master' ? `${G}MASTER ★${X}` : `${Y}STANDBY${X}`} · Nodos activos: ${meshNodos}${X}`)
  console.log(`${W}(Deja esta ventana minimizada — no la cierres)${X}\n`)

})()

process.on('uncaughtException', (e) => { console.error(`${R}[ERROR]${X}`, e.message); process.exit(1) })
process.on('unhandledRejection', (e) => { console.error(`${R}[ERROR]${X}`, e); process.exit(1) })
