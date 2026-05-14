#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v3
// ============================================================
// - Polling de print_jobs cada 3s
// - Re-discovery al arrancar: verifica IPs, busca por MAC si cambiaron
// ============================================================

const net = require('net')
const os  = require('os')
const { execSync } = require('child_process')

const API      = (process.env.IAREST_API    || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN    = process.env.BRIDGE_TOKEN   || ''
const POLL_MS  = parseInt(process.env.POLL_MS || '3000', 10)
const TCP_MS   = 5000

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado.')
  process.exit(1)
}

// ── Colores ──────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', gray: '\x1b[90m', bold: '\x1b[1m',
}
function log(level, msg) {
  const ts    = new Date().toLocaleTimeString('es-ES')
  const color = { info: C.gray, ok: C.green, warn: C.yellow, error: C.red }[level] || ''
  console.log(`${C.gray}${ts}${C.reset} ${color}[${level.toUpperCase()}]${C.reset} ${msg}`)
}

// ── TCP helpers ───────────────────────────────────────────────
function checkPort(ip, port, timeoutMs = 500) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(timeoutMs)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('error',   () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

function enviarAlaPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(new Error('IP no configurada'))
    const socket = new net.Socket()
    let sent = false
    socket.setTimeout(TCP_MS)
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

// ── MAC helpers ───────────────────────────────────────────────
function normalizeMac(mac) {
  if (!mac) return null
  return mac.replace(/-/g, ':').toLowerCase().trim()
}

function getMacForIp(ip) {
  try {
    // Ping para poblar la caché ARP
    const pingCmd = process.platform === 'win32'
      ? `ping -n 1 -w 300 ${ip}`
      : `ping -c 1 -W 1 ${ip}`
    try { execSync(pingCmd, { timeout: 1500, stdio: 'ignore' }) } catch {}

    // Leer ARP
    const arpCmd = process.platform === 'win32' ? `arp -a ${ip}` : `arp -n ${ip}`
    const out = execSync(arpCmd, { timeout: 2000 }).toString()
    const match = out.match(/([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/)
    return match ? normalizeMac(match[0]) : null
  } catch { return null }
}

// ── IP local y subnet ─────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return null
}

async function scanSubnet(subnet) {
  const found = []
  const checks = []
  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`
    checks.push(checkPort(ip, 9100, 400).then(ok => { if (ok) found.push(ip) }))
  }
  await Promise.all(checks)
  return found
}

// ── Re-discovery al arrancar ──────────────────────────────────
async function redescubrirImpresoras() {
  try {
    const res = await fetch(`${API}/api/bridge/printers?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return

    const { impresoras } = await res.json()
    if (!impresoras?.length) return

    log('info', `Verificando ${impresoras.length} impresora(s)...`)

    const offline = []
    for (const imp of impresoras) {
      const ok = await checkPort(imp.ip_address, imp.port ?? 9100, 1000)
      if (ok) {
        log('ok', `${imp.nombre} — ${imp.ip_address} ✓`)
      } else {
        log('warn', `${imp.nombre} — ${imp.ip_address} sin respuesta`)
        offline.push(imp)
      }
    }

    if (!offline.length) return

    // Hay impresoras offline — escanear subnet
    const localIP = getLocalIP()
    if (!localIP) { log('warn', 'No se pudo detectar la IP local'); return }

    const subnet = localIP.split('.').slice(0, 3).join('.')
    log('info', `Escaneando ${subnet}.0/24 para reubicar impresoras...`)

    const foundIPs = await scanSubnet(subnet)
    const knownIPs = new Set(impresoras.filter(i => !offline.includes(i)).map(i => i.ip_address))
    const newIPs   = foundIPs.filter(ip => !knownIPs.has(ip))

    if (!newIPs.length) {
      log('warn', 'No se encontraron nuevas IPs en la red')
      return
    }

    // Obtener MACs de nuevas IPs
    const ipMacs = {}
    for (const ip of newIPs) {
      const mac = getMacForIp(ip)
      if (mac) { ipMacs[ip] = mac; log('info', `  ${ip} → MAC ${mac}`) }
    }

    // Cruzar MACs con impresoras offline
    for (const imp of offline) {
      if (!imp.mac_address) {
        log('warn', `${imp.nombre} sin MAC guardada — no se puede reubicar`)
        continue
      }

      const macBuscada = normalizeMac(imp.mac_address)
      const newIP = Object.keys(ipMacs).find(ip => normalizeMac(ipMacs[ip]) === macBuscada)

      if (newIP) {
        log('ok', `${imp.nombre} encontrada en nueva IP: ${newIP} (MAC: ${macBuscada})`)
        try {
          const r = await fetch(`${API}/api/bridge/update-ip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: TOKEN, impresora_id: imp.id, new_ip: newIP }),
          })
          const d = await r.json()
          if (d.ok) log('ok', `IP actualizada: ${imp.ip_address} → ${newIP}`)
          else log('error', `Error actualizando IP: ${d.error}`)
        } catch (e) {
          log('error', `Error llamando update-ip: ${e.message}`)
        }
      } else {
        log('warn', `${imp.nombre} (MAC: ${macBuscada}) no encontrada en la red`)
      }
    }
  } catch (err) {
    log('warn', `Re-discovery: ${err.message}`)
  }
}

// ── Confirmar job ─────────────────────────────────────────────
async function confirmar(jobId, status, errorMsg) {
  try {
    const res = await fetch(`${API}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, status, error_msg: errorMsg }),
    })
    if (!res.ok) log('warn', `Confirmación fallida ${jobId.slice(0,8)}: HTTP ${res.status}`)
  } catch (err) {
    log('warn', `Error confirmando ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── Polling de jobs ───────────────────────────────────────────
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
      log('warn', `Polling: HTTP ${res.status}`)
      return
    }
    const { jobs } = await res.json()
    if (!jobs?.length) return
    log('info', `${jobs.length} job(s)`)
    for (const job of jobs) {
      const tag = `[${job.id.slice(0,8)}] ${job.ip}:${job.port}`
      try {
        await enviarAlaPrinter(job.ip, job.port, job.print_data)
        log('ok', `Impreso ✓ ${tag}`)
        await confirmar(job.id, 'impreso')
      } catch (err) {
        log('error', `Fallo ✗ ${tag} — ${err.message}`)
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
console.log(`${C.bold}[ia.rest Bridge] v3${C.reset} · token: ${TOKEN.slice(0,8)}...`)
console.log(`${C.gray}API: ${API} · Poll: ${POLL_MS}ms${C.reset}`)
console.log('')

// Re-discovery al arrancar, luego polling continuo
redescubrirImpresoras().then(() => {
  log('ok', 'Bridge listo. Esperando jobs...')
  setInterval(poll, POLL_MS)
  poll()
})

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
