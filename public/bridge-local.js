#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v5.1.3
// - Polling + TCP ESC/POS
// - Discovery: escanea subnet, registra impresoras
// - Model detection: HTTP probe + OUI MAC table
// - Auto-restart real con spawn (fix crash handlers)
// - Polling inmediato sin esperar al discover
// - Watchdog lastPollOk actualizado al inicio del poll
// ============================================================
const VERSION = '5.1.3'

const net    = require('net')
const os     = require('os')
const http   = require('http')
const { spawn } = require('child_process')

const API     = (process.env.IAREST_API  || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN   = process.env.BRIDGE_TOKEN || ''
const POLL_MS = parseInt(process.env.POLL_MS || '3000', 10)
const TCP_TIMEOUT = 5000

if (!TOKEN) { console.error('[BRIDGE] BRIDGE_TOKEN no configurado.'); process.exit(1) }

const C = { reset:'\x1b[0m', green:'\x1b[32m', yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m', bold:'\x1b[1m' }
function log(level, msg) {
  const ts = new Date().toLocaleTimeString('es-ES')
  const color = { info:C.gray, ok:C.green, warn:C.yellow, error:C.red }[level] || ''
  console.log(`${C.gray}${ts}${C.reset} ${color}[${level.toUpperCase()}]${C.reset} ${msg}`)
}

// ── OUI → fabricante/perfil ───────────────────────────────────
const OUI_MAP = {
  'ac:cf:85': { fabricante: 'Sunmi',  perfil: 'sunmi'    },
  'b0:e2:35': { fabricante: 'Sunmi',  perfil: 'sunmi'    },
  '00:26:ab': { fabricante: 'Epson',  perfil: 'epson_tm' },
  '00:1c:62': { fabricante: 'Epson',  perfil: 'epson_tm' },
  '08:00:46': { fabricante: 'Star',   perfil: 'star_tsp' },
  '00:80:92': { fabricante: 'Star',   perfil: 'star_tsp' },
  'a8:23:fe': { fabricante: 'Star',   perfil: 'star_tsp' },
  '48:d3:43': { fabricante: 'Citizen',perfil: 'citizen'  },
  '00:0b:97': { fabricante: 'Bixolon',perfil: 'bixolon'  },
}

// ── HTTP probe para detectar modelo ──────────────────────────
function httpProbe(ip, port = 80, timeout = 2000) {
  return new Promise(resolve => {
    const req = http.get({ host: ip, port, path: '/', timeout }, res => {
      let body = ''
      res.on('data', d => { body += d; if (body.length > 2000) req.destroy() })
      res.on('end', () => resolve(body))
      res.on('error', () => resolve(null))
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
    setTimeout(() => { try { req.destroy() } catch {} resolve(null) }, timeout + 500)
  })
}

function detectarModelo(html) {
  if (!html) return null
  const h = html.toLowerCase()
  if (h.includes('sunmi'))              return { modelo: 'Sunmi NT311', fabricante: 'Sunmi',   perfil: 'sunmi'    }
  if (h.includes('epson'))              return { modelo: 'Epson TM',    fabricante: 'Epson',   perfil: 'epson_tm' }
  if (h.includes('tm-t'))               return { modelo: 'Epson TM-T',  fabricante: 'Epson',   perfil: 'epson_tm' }
  if (h.includes('star'))               return { modelo: 'Star TSP',    fabricante: 'Star',    perfil: 'star_tsp' }
  if (h.includes('tsp'))                return { modelo: 'Star TSP',    fabricante: 'Star',    perfil: 'star_tsp' }
  if (h.includes('citizen'))            return { modelo: 'Citizen',     fabricante: 'Citizen', perfil: 'citizen'  }
  if (h.includes('bixolon'))            return { modelo: 'Bixolon',     fabricante: 'Bixolon', perfil: 'bixolon'  }
  if (h.includes('printer') || h.includes('pos')) return { modelo: 'Impresora ESC/POS', fabricante: null, perfil: 'generico' }
  return null
}

// ── TCP probe ─────────────────────────────────────────────────
function tcpProbe(ip, port, ms) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(ms || 500)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
    s.on('error', () => { s.destroy(); resolve(false) })
  })
}

// ── TCP send a impresora ──────────────────────────────────────
function enviarAlaPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(new Error('IP no configurada'))
    const socket = new net.Socket()
    let sent = false
    socket.setTimeout(TCP_TIMEOUT)
    socket.connect(port, ip, () => {
      const buf = Buffer.from(data, 'base64')
      socket.write(buf, err => {
        if (err) { socket.destroy(); return reject(err) }
        setTimeout(() => { socket.end(); sent = true; resolve(true) }, 200)
      })
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')) })
    socket.on('error', err => { if (!sent) reject(err) })
    socket.on('close', () => { if (!sent) reject(new Error('Socket cerrado')) })
  })
}

// ── Confirmar job ─────────────────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    await fetch(`${API}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
  } catch {}
}

// ── Subnet ────────────────────────────────────────────────────
function getSubnet() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const p = iface.address.split('.')
        return `${p[0]}.${p[1]}.${p[2]}`
      }
    }
  }
  return null
}

// ── Escanear subnet ───────────────────────────────────────────
async function scanSubnet(subnet) {
  const found = []
  const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)
  for (let i = 0; i < ips.length; i += 50) {
    const res = await Promise.all(
      ips.slice(i, i + 50).map(async ip => (await tcpProbe(ip, 9100, 400)) ? ip : null)
    )
    found.push(...res.filter(Boolean))
  }
  return found
}

// ── Detectar info impresora (HTTP + OUI) ──────────────────────
async function detectarInfoImpresora(ip) {
  const result = { modelo: null, fabricante: null, perfil: 'generico', mac: null }

  // HTTP probe en puerto 80
  const html = await httpProbe(ip, 80, 2000)
  const detected = detectarModelo(html)
  if (detected) {
    result.modelo     = detected.modelo
    result.fabricante = detected.fabricante
    result.perfil     = detected.perfil
    log('ok', `${ip} → modelo detectado: ${detected.modelo} (HTTP)`)
  }

  // También intentar puerto 443 si no hubo respuesta
  if (!result.modelo) {
    const html8080 = await httpProbe(ip, 8080, 1500)
    const d2 = detectarModelo(html8080)
    if (d2) {
      result.modelo = d2.modelo; result.fabricante = d2.fabricante; result.perfil = d2.perfil
      log('ok', `${ip} → modelo detectado: ${d2.modelo} (puerto 8080)`)
    }
  }

  if (!result.modelo) {
    log('info', `${ip} → modelo no detectado, usando perfil genérico`)
  }

  return result
}

// ── Discovery ─────────────────────────────────────────────────
let scanning = false
async function discover() {
  if (scanning) return
  scanning = true
  try {
    const r = await fetch(`${API}/api/bridge/printers?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return
    const { impresoras } = await r.json()
    const registradas = impresoras || []

    const subnet = getSubnet()
    if (!subnet) { log('warn', 'No se pudo detectar la red local'); return }

    log('info', `Escaneando ${subnet}.0/24...`)
    const found = await scanSubnet(subnet)

    if (!found.length) {
      log('warn', 'No se encontraron impresoras en la red')
      return
    }

    log('info', `${found.length} dispositivo(s) en puerto 9100`)
    const knownIps  = new Set(registradas.map(i => i.ip_address))
    let contador    = registradas.length + 1

    for (const ip of found) {
      if (knownIps.has(ip)) {
        const imp = registradas.find(i => i.ip_address === ip)
        log('ok', `${imp?.nombre || ip} OK`)
        continue
      }

      // IP nueva → detectar modelo
      log('info', `Nueva impresora en ${ip} — detectando modelo...`)
      const info = await detectarInfoImpresora(ip)

      // IP nueva que puede ser una registrada offline (misma subred)
      const offline = registradas.filter(i => !found.includes(i.ip_address))
      if (offline.length === 1) {
        log('ok', `${offline[0].nombre}: IP actualizada ${offline[0].ip_address} → ${ip}`)
        await fetch(`${API}/api/bridge/update-ip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body: JSON.stringify({ impresora_id: offline[0].id, new_ip: ip, ...info }),
        }).catch(() => {})
        continue
      }

      // Nueva impresora
      const nombre = `Impresora ${contador}`
      log('info', `Registrando: ${nombre} (${ip})${info.modelo ? ' · ' + info.modelo : ''}`)
      try {
        const reg = await fetch(`${API}/api/bridge/register-printer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body: JSON.stringify({
            ip_address: ip, port: 9100, nombre,
            connection_type: 'ip_local',
            modelo:     info.modelo,
            fabricante: info.fabricante,
            perfil_escpos: info.perfil,
          }),
        })
        const d = await reg.json()
        if (d.ok) {
          log('ok', `${nombre} registrada${info.modelo ? ' · ' + info.modelo : ''}`)
          await fetch(`${API}/api/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: 'test', impresora_id: d.id }),
          }).catch(() => {})
          contador++
        }
      } catch (err) {
        log('warn', `Error registrando ${ip}: ${err.message}`)
      }
    }
  } catch (err) {
    log('warn', `Discovery: ${err.message}`)
  } finally {
    scanning = false
  }
}

// ── Polling ───────────────────────────────────────────────────
let running = false
async function poll() {
  if (running) return
  running = true
  try {
    const res = await fetch(`${API}/api/print?token=${TOKEN}&v=${VERSION}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      if (res.status === 401) { log('error', 'Token invalido.'); process.exit(1) }
      log('warn', `Polling HTTP ${res.status}`); return
    }
    const data = await res.json()
    if (data.scan_requested) {
      log('info', 'Escaneo solicitado desde el panel...')
      discover().catch(() => {})
    }
    if (!data.jobs?.length) return
    log('info', `${data.jobs.length} job(s) recibido(s)`)
    for (const job of data.jobs) {
      const tag = `[${job.id.slice(0,8)}] ${job.ip}:${job.port}`
      try {
        log('info', `Enviando -> ${tag}`)
        await enviarAlaPrinter(job.ip, job.port, job.print_data)
        log('ok', `Impreso OK ${tag}`)
        await confirmar(job.id, 'impreso')
      } catch (err) {
        log('error', `Fallo ✗ ${tag} - ${err.message}`)
        await confirmar(job.id, 'error', err.message)
      }
    }
  } catch (err) {
    if (err.name !== 'TimeoutError') log('warn', `Poll: ${err.message}`)
  } finally {
    running = false
  }
}

// ── Servidor de gestión local (localhost:47801) ───────────────
// Permite al panel web activar/reiniciar el bridge desde el mismo PC
const MGMT_PORT = parseInt(process.env.MGMT_PORT || '47801', 10)
const ALLOWED_ORIGIN = process.env.MGMT_ORIGIN || 'https://www.iarest.es'

const mgmtServer = http.createServer((req, res) => {
  // Solo aceptar conexiones desde localhost
  const remoteAddr = req.socket.remoteAddress
  const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1'
  if (!isLocal) { res.writeHead(403); res.end('Forbidden'); return }

  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Private-Network': 'true',  // requerido Chrome 101+ para fetch https→localhost
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders); res.end(); return
  }

  const url = req.url?.split('?')[0] || '/'

  if (url === '/status' && req.method === 'GET') {
    res.writeHead(200, corsHeaders)
    res.end(JSON.stringify({ ok: true, version: VERSION, uptime: process.uptime(), running }))
    return
  }

  if (url === '/ping' && req.method === 'POST') {
    log('info', 'Activación remota desde el panel web — forzando poll...')
    poll().catch(() => {})
    res.writeHead(200, corsHeaders)
    res.end(JSON.stringify({ ok: true, message: 'Poll forzado' }))
    return
  }

  res.writeHead(404, corsHeaders)
  res.end(JSON.stringify({ error: 'Not found' }))
})

mgmtServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log('warn', `Puerto de gestión ${MGMT_PORT} ya en uso — otro bridge activo`)
  } else {
    log('warn', `Servidor gestión: ${err.message}`)
  }
})

// ── Arranque ──────────────────────────────────────────────────
console.log(`${C.bold}[ia.rest Bridge] v${VERSION} · token: ${TOKEN.slice(0,8)}...${C.reset}`)
console.log(`${C.gray}API: ${API}${C.reset}`)
console.log('')

mgmtServer.listen(MGMT_PORT, '127.0.0.1', () => {
  log('ok', `Servidor de gestión local en puerto ${MGMT_PORT}`)
})

// ── Auto-restart real: relanza el propio proceso ──────────────
let _restarting = false
function autoRestart(motivo, delaySec = 5) {
  if (_restarting) return
  _restarting = true
  log('warn', `${motivo} — reiniciando en ${delaySec}s...`)
  setTimeout(() => {
    try {
      const child = spawn(process.execPath, process.argv.slice(1), {
        env:      process.env,
        detached: true,
        stdio:    'inherit',
      })
      child.unref()
    } catch (e) {
      log('error', `No se pudo relanzar el proceso: ${e.message}`)
    }
    process.exit(0)
  }, delaySec * 1000)
}

// ── Crash handlers ────────────────────────────────────────────
process.on('uncaughtException',  (err) => autoRestart(`Error fatal: ${err.message}`))
process.on('unhandledRejection', (err) => autoRestart(`Promesa rechazada: ${String(err)}`))

// ── Watchdog de actividad: si lleva 10 min sin poll, reinicia ──
// IMPORTANTE: inicializar ANTES de que empiece el discover para que el contador
// no expire mientras el escaneo de red está en marcha.
let lastPollOk = Date.now()
const _pollOrig = poll
poll = async function() {
  lastPollOk = Date.now()   // ← actualizar AL INICIO (no al final) para que no expire durante la ejecución
  await _pollOrig()
}
setInterval(() => {
  if (Date.now() - lastPollOk > 10 * 60 * 1000) {
    autoRestart('Watchdog: sin actividad 10 min')
  }
}, 60_000)

// ── Arranque: polling inmediato, discover en background ───────
// El polling no espera al discover (que puede tardar varios minutos en redes lentas).
log('ok', 'Bridge listo. Esperando jobs...')
setInterval(poll, POLL_MS)
poll()
discover().catch(() => {})   // en background, sin bloquear

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
