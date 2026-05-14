#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v4
// - Polling jobs via TCP ESC/POS (base original que funcionaba)
// - MAC rediscovery: si impresora cambia IP la encuentra sola
// - scan_requested: owner pulsa boton y bridge escanea red
// ============================================================

const net = require('net')
const os  = require('os')
const { exec } = require('child_process')

const API      = (process.env.IAREST_API  || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN    = process.env.BRIDGE_TOKEN || ''
const POLL_MS  = parseInt(process.env.POLL_MS || '3000', 10)
const TIMEOUT_MS = 5000

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado. Copia el token desde /owner -> Impresoras.')
  process.exit(1)
}

const COL = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red:   '\x1b[31m', gray:  '\x1b[90m', bold:   '\x1b[1m',
}

function log(level, msg) {
  const ts    = new Date().toLocaleTimeString('es-ES')
  const color = { info: COL.gray, ok: COL.green, warn: COL.yellow, error: COL.red }[level] || ''
  console.log(`${COL.gray}${ts}${COL.reset} ${color}[${level.toUpperCase()}]${COL.reset} ${msg}`)
}

// ── TCP send ─────────────────────────────────────────────────
function enviarAlaPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(new Error('IP no configurada'))
    const socket = new net.Socket()
    let sent = false
    socket.setTimeout(TIMEOUT_MS)
    socket.connect(port, ip, () => {
      const buf = Buffer.from(data, 'base64')
      socket.write(buf, err => {
        if (err) { socket.destroy(); return reject(err) }
        setTimeout(() => { socket.end(); sent = true; resolve(true) }, 200)
      })
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout - impresora no responde`)) })
    socket.on('error',   err => { if (!sent) reject(err) })
    socket.on('close',   ()  => { if (!sent) reject(new Error('Socket cerrado antes de enviar')) })
  })
}

// ── Confirmar job ─────────────────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    const res = await fetch(`${API}/api/print`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
    if (!res.ok) log('warn', `Confirmacion fallida job ${jobId.slice(0,8)}: HTTP ${res.status}`)
  } catch (err) {
    log('warn', `Error confirmando job ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── TCP probe (rediscovery) ───────────────────────────────────
function tcpProbe(ip, port, ms = 500) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(ms)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
    s.on('error',   () => { s.destroy(); resolve(false) })
  })
}

// ── Leer MAC via ARP ──────────────────────────────────────────
function getMac(ip) {
  return new Promise(resolve => {
    const cmd = process.platform === 'win32' ? `arp -a ${ip}` : `arp -n ${ip}`
    exec(cmd, (err, stdout) => {
      if (err) return resolve(null)
      const m = stdout.match(/([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})/i)
      resolve(m ? m[1].replace(/-/g, ':').toLowerCase() : null)
    })
  })
}

// ── Subnet local ─────────────────────────────────────────────
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
  const batch = 50
  const ips   = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)
  for (let i = 0; i < ips.length; i += batch) {
    const results = await Promise.all(ips.slice(i, i + batch).map(async ip => {
      return (await tcpProbe(ip, 9100, 400)) ? ip : null
    }))
    found.push(...results.filter(Boolean))
  }
  return found
}

// ── Rediscovery por MAC ───────────────────────────────────────
let scanning = false
async function rediscover() {
  if (scanning) return
  scanning = true
  try {
    log('info', 'Chequeando impresoras...')
    const r = await fetch(`${API}/api/bridge/printers?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return
    const { impresoras } = await r.json()
    if (!impresoras?.length) {
      log('info', 'Sin impresoras registradas. Usa /owner -> Impresoras -> Buscar en red.')
      return
    }

    const offline = []
    for (const imp of impresoras) {
      if (!imp.ip_address) { offline.push(imp); continue }
      const ok = await tcpProbe(imp.ip_address, imp.port || 9100, 1000)
      if (ok) log('ok',   `${imp.nombre} - ${imp.ip_address} OK`)
      else  { log('warn', `${imp.nombre} - ${imp.ip_address} sin respuesta`); offline.push(imp) }
    }

    if (!offline.length) { log('ok', 'Todas las impresoras accesibles'); return }

    const subnet = getSubnet()
    if (!subnet) return
    log('info', `Buscando ${offline.length} impresora(s) offline en ${subnet}.0/24...`)

    const found   = await scanSubnet(subnet)
    const knownIps = new Set(impresoras.filter(i => !offline.includes(i)).map(i => i.ip_address))
    const newIps   = found.filter(ip => !knownIps.has(ip))

    for (const ip of newIps) {
      const mac = await getMac(ip)
      if (!mac) continue
      const match = offline.find(i => i.mac_address && i.mac_address.toLowerCase() === mac)
      if (!match) continue
      log('ok', `${match.nombre}: IP ${match.ip_address} -> ${ip} (MAC ${mac})`)
      await fetch(`${API}/api/bridge/update-ip`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
        body:    JSON.stringify({ impresora_id: match.id, mac_address: mac, new_ip: ip }),
      }).catch(() => {})
      match.ip_address = ip
    }
  } catch (err) {
    log('warn', `Rediscovery error: ${err.message}`)
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
      log('warn', `Polling: HTTP ${res.status}`)
      return
    }

    const data = await res.json()
    const { jobs } = data

    // Owner solicito escaneo desde el panel
    if (data.scan_requested) {
      log('info', 'Escaneo solicitado desde el panel...')
      rediscover().catch(() => {})
    }

    if (!jobs?.length) return

    log('info', `${jobs.length} job(s) recibido(s)`)
    for (const job of jobs) {
      const tag = `[${job.id.slice(0,8)}] ${job.ip}:${job.port}`
      try {
        log('info', `Enviando -> ${tag}`)
        await enviarAlaPrinter(job.ip, job.port, job.print_data)
        log('ok',   `Impreso  OK ${tag}`)
        await confirmar(job.id, 'impreso')
      } catch (err) {
        log('error', `Fallo    ✗ ${tag} - ${err.message}`)
        await confirmar(job.id, 'error', err.message)
      }
    }
  } catch (err) {
    if (err.name !== 'TimeoutError') log('warn', `Poll error: ${err.message}`)
  } finally {
    running = false
  }
}

// ── Arranque ──────────────────────────────────────────────────
console.log(`${COL.bold}[ia.rest Bridge] v4 · token: ${TOKEN.slice(0,8)}...${COL.reset}`)
console.log(`${COL.gray}API: ${API} · Poll: cada ${POLL_MS}ms${COL.reset}`)
console.log('')

rediscover().then(() => {
  log('ok', 'Bridge listo. Esperando jobs...')
  setInterval(poll, POLL_MS)
  poll()
})

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
