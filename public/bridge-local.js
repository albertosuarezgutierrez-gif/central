#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v3
// - Polling de print jobs via TCP ESC/POS
// - Rediscovery automático por MAC al arrancar
//   Si una impresora cambia de IP por DHCP, la encuentra sola
// ============================================================

const net = require('net')
const os  = require('os')

const API      = (process.env.IAREST_API    || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN    = process.env.BRIDGE_TOKEN   || ''
const POLL_MS  = parseInt(process.env.POLL_MS || '3000', 10)
const TIMEOUT  = 5000

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado.')
  process.exit(1)
}

const COL = {
  reset:  '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red:    '\x1b[31m', gray:  '\x1b[90m', bold:   '\x1b[1m',
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
    socket.setTimeout(TIMEOUT)
    socket.connect(port, ip, () => {
      const buf = Buffer.from(data, 'base64')
      socket.write(buf, err => {
        if (err) { socket.destroy(); return reject(err) }
        setTimeout(() => { socket.end(); sent = true; resolve(true) }, 200)
      })
    })
    socket.on('timeout', () => { socket.destroy(); reject(new Error(`Timeout — impresora no responde`)) })
    socket.on('error',   err => { if (!sent) reject(err) })
    socket.on('close',   ()  => { if (!sent) reject(new Error('Socket cerrado antes de enviar')) })
  })
}

// ── Confirmar job al servidor ─────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    await fetch(`${API}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
  } catch (err) {
    log('warn', `Error confirmando job ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── TCP probe (para rediscovery) ──────────────────────────────
function tcpProbe(ip, port, timeoutMs = 500) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.connect(port, ip, () => { socket.destroy(); resolve(true) })
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
    socket.on('error',   () => { socket.destroy(); resolve(false) })
  })
}

// ── Leer ARP table del sistema ────────────────────────────────
function getMacFromArp(ip) {
  return new Promise(resolve => {
    const { exec } = require('child_process')
    const cmd = process.platform === 'win32' ? `arp -a ${ip}` : `arp -n ${ip}`
    exec(cmd, (err, stdout) => {
      if (err) return resolve(null)
      // Windows: "  192.168.1.138    aa-bb-cc-dd-ee-ff    dynamic"
      // Linux:   "? (192.168.1.138) at aa:bb:cc:dd:ee:ff [ether]"
      const match = stdout.match(/([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})/i)
      if (!match) return resolve(null)
      // Normalizar a formato aa:bb:cc:dd:ee:ff
      const mac = match[1].replace(/-/g, ':').toLowerCase()
      resolve(mac)
    })
  })
}

// ── Detectar subnet local ─────────────────────────────────────
function getLocalSubnet() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.')
        return { subnet: `${parts[0]}.${parts[1]}.${parts[2]}`, localIp: iface.address }
      }
    }
  }
  return null
}

// ── Escanear subnet buscando puerto 9100 ──────────────────────
async function scanSubnet(subnet, concurrency = 50) {
  const found = []
  const ips = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`)

  for (let i = 0; i < ips.length; i += concurrency) {
    const batch = ips.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(async ip => {
      const ok = await tcpProbe(ip, 9100, 400)
      return ok ? ip : null
    }))
    found.push(...results.filter(Boolean))
  }
  return found
}

// ── Rediscovery por MAC ───────────────────────────────────────
async function rediscoverPrinters() {
  log('info', 'Iniciando chequeo de impresoras...')

  let impresoras = []
  try {
    const r = await fetch(`${API}/api/bridge/printers?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) { log('warn', 'No se pudo obtener lista de impresoras'); return }
    const d = await r.json()
    impresoras = d.impresoras || []
  } catch (err) {
    log('warn', `Error obteniendo impresoras: ${err.message}`); return
  }

  if (impresoras.length === 0) {
    log('info', 'Sin impresoras registradas. Usa /owner para configurarlas.')
    return
  }

  log('info', `${impresoras.length} impresora(s) registrada(s). Verificando conectividad...`)

  const offline = []
  for (const imp of impresoras) {
    if (!imp.ip_address) { offline.push(imp); continue }
    const ok = await tcpProbe(imp.ip_address, imp.port || 9100, 1000)
    if (ok) {
      log('ok', `${imp.nombre} — ${imp.ip_address} ✓`)
    } else {
      log('warn', `${imp.nombre} — ${imp.ip_address} sin respuesta`)
      offline.push(imp)
    }
  }

  if (offline.length === 0) {
    log('ok', 'Todas las impresoras accesibles')
    return
  }

  // Hay impresoras offline — escanear subnet
  const net2 = getLocalSubnet()
  if (!net2) { log('warn', 'No se pudo detectar la red local'); return }

  log('info', `Buscando ${offline.length} impresora(s) en ${net2.subnet}.0/24...`)
  const foundIps = await scanSubnet(net2.subnet)

  // IPs conocidas (online)
  const knownIps = new Set(impresoras.filter(i => !offline.includes(i)).map(i => i.ip_address))
  const newIps   = foundIps.filter(ip => !knownIps.has(ip))

  if (newIps.length === 0) {
    log('warn', 'No se encontraron IPs nuevas en la red')
    return
  }

  log('info', `${newIps.length} IP(s) nueva(s) encontrada(s): ${newIps.join(', ')}`)

  // Obtener MACs de las IPs nuevas
  for (const ip of newIps) {
    const mac = await getMacFromArp(ip)
    if (!mac) { log('warn', `No se pudo obtener MAC de ${ip}`); continue }

    // Buscar impresora offline con esa MAC
    const match = offline.find(imp => imp.mac_address && imp.mac_address.toLowerCase() === mac)

    if (match) {
      log('ok', `${match.nombre}: IP actualizada ${match.ip_address} → ${ip} (MAC: ${mac})`)
      try {
        const r = await fetch(`${API}/api/bridge/update-ip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body: JSON.stringify({ impresora_id: match.id, mac_address: mac, new_ip: ip }),
        })
        const d = await r.json()
        if (d.ok) {
          match.ip_address = ip // actualizar en memoria
          log('ok', `BD actualizada — ${match.nombre} ahora en ${ip}`)
        }
      } catch (err) {
        log('warn', `Error actualizando IP en BD: ${err.message}`)
      }
    } else {
      // IP nueva sin MAC conocida — puede ser nueva impresora no registrada
      log('info', `IP nueva ${ip} (MAC: ${mac}) — impresora no registrada`)
    }
  }
}

// ── Polling ───────────────────────────────────────────────────
let running = false

async function poll() {
  if (running) return
  running = true
  try {
    const res = await fetch(`${API}/api/print?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      if (res.status === 401) { log('error', 'Token inválido.'); process.exit(1) }
      log('warn', `Polling: HTTP ${res.status}`); return
    }
    const { jobs } = await res.json()
    if (!jobs?.length) return
    log('info', `${jobs.length} job(s) recibido(s)`)
    for (const job of jobs) {
      const tag = `[${job.id.slice(0,8)}] ${job.ip}:${job.port}`
      try {
        log('info', `Enviando → ${tag}`)
        await enviarAlaPrinter(job.ip, job.port, job.print_data)
        log('ok', `Impreso ✓ ${tag}`)
        await confirmar(job.id, 'impreso')
      } catch (err) {
        log('error', `Fallo ✗ ${tag} — ${err.message}`)
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
console.log(`${COL.bold}[ia.rest Bridge] v3 · token: ${TOKEN.slice(0,8)}...${COL.reset}`)

// Rediscovery al arrancar, luego polling
rediscoverPrinters().then(() => {
  log('ok', 'Bridge listo. Escuchando jobs...')
  setInterval(poll, POLL_MS)
  poll()
})

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
