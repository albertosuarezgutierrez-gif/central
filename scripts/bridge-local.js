#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v5
// Minimo y seguro - sin exec/spawn/fs
// Polling + TCP + Discovery por IP
// ============================================================
const VERSION = '5.0'

const net = require('net')
const os  = require('os')

const API     = (process.env.IAREST_API  || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN   = process.env.BRIDGE_TOKEN || ''
const POLL_MS = parseInt(process.env.POLL_MS || '3000', 10)
const TCP_TIMEOUT = 5000

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado.')
  process.exit(1)
}

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red:   '\x1b[31m', gray:  '\x1b[90m', bold:   '\x1b[1m',
}

function log(level, msg) {
  const ts    = new Date().toLocaleTimeString('es-ES')
  const color = { info: C.gray, ok: C.green, warn: C.yellow, error: C.red }[level] || ''
  console.log(`${C.gray}${ts}${C.reset} ${color}[${level.toUpperCase()}]${C.reset} ${msg}`)
}

// ── TCP probe ─────────────────────────────────────────────────
function tcpProbe(ip, port, ms) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(ms || 500)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
    s.on('error',   () => { s.destroy(); resolve(false) })
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
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout - impresora no responde')) })
    socket.on('error',   err => { if (!sent) reject(err) })
    socket.on('close',   ()  => { if (!sent) reject(new Error('Socket cerrado')) })
  })
}

// ── Confirmar job ─────────────────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    await fetch(`${API}/api/print`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
  } catch (err) {
    log('warn', `Error confirmando ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── Detectar subnet ───────────────────────────────────────────
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

// ── Escanear subnet puerto 9100 ───────────────────────────────
async function scanSubnet(subnet) {
  const found = []
  const ips   = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)
  for (let i = 0; i < ips.length; i += 50) {
    const res = await Promise.all(
      ips.slice(i, i + 50).map(async ip => (await tcpProbe(ip, 9100, 400)) ? ip : null)
    )
    found.push(...res.filter(Boolean))
  }
  return found
}

// ── Discovery: registrar nuevas + actualizar IPs cambiadas ────
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
      log('info', 'Verifica que esten encendidas y en la misma red WiFi')
      return
    }

    log('info', `${found.length} dispositivo(s) en puerto 9100`)

    const knownIps = new Set(registradas.map(i => i.ip_address))
    let contador   = registradas.length + 1

    for (const ip of found) {
      // IP ya registrada y online
      if (knownIps.has(ip)) {
        const imp = registradas.find(i => i.ip_address === ip)
        log('ok', `${imp?.nombre || ip} - OK`)
        continue
      }

      // IP nueva — puede ser impresora que cambio de IP o nueva
      // Buscar si hay alguna registrada offline que pudiera ser esta
      const offline = registradas.filter(i => !found.includes(i.ip_address))
      if (offline.length === 1) {
        // Solo hay una offline y encontramos una IP nueva → es ella
        const imp = offline[0]
        log('ok', `${imp.nombre}: IP actualizada ${imp.ip_address} -> ${ip}`)
        await fetch(`${API}/api/bridge/update-ip`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body:    JSON.stringify({ impresora_id: imp.id, new_ip: ip }),
        }).catch(() => {})
        continue
      }

      // Impresora nueva no registrada
      log('info', `Nueva impresora: ${ip} → registrando como Impresora ${contador}`)
      try {
        const reg = await fetch(`${API}/api/bridge/register-printer`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body:    JSON.stringify({
            ip_address:      ip,
            port:            9100,
            nombre:          `Impresora ${contador}`,
            connection_type: 'ip_local',
          }),
        })
        const d = await reg.json()
        if (d.ok) {
          log('ok', `Impresora ${contador} registrada (${ip})`)
          // Ticket de prueba
          await fetch(`${API}/api/print`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ trigger: 'test', impresora_id: d.id }),
          }).catch(() => {})
          log('ok', `Ticket de prueba enviado`)
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

// ── Polling principal ─────────────────────────────────────────
let running = false
async function poll() {
  if (running) return
  running = true
  try {
    const res = await fetch(`${API}/api/print?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      if (res.status === 401) { log('error', 'Token invalido.'); process.exit(1) }
      log('warn', `Polling HTTP ${res.status}`)
      return
    }

    const data = await res.json()

    // Owner pulsó "Buscar en red"
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
        log('ok',   `Impreso OK ${tag}`)
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

// ── Arranque ──────────────────────────────────────────────────
console.log(`${C.bold}[ia.rest Bridge] v${VERSION} · token: ${TOKEN.slice(0,8)}...${C.reset}`)
console.log(`${C.gray}API: ${API}${C.reset}`)
console.log('')

// Discovery al arrancar, luego polling
discover().then(() => {
  log('ok', 'Bridge listo. Esperando jobs...')
  setInterval(poll, POLL_MS)
  poll()
})

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
