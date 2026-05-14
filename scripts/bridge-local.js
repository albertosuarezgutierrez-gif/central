#!/usr/bin/env node
// ============================================================
// ia.rest · Bridge local v4.2
// Sin wizard externo - todo en este archivo
// Al arrancar: auto-update + escaneo red + registro impresoras
// ============================================================
const VERSION = '4.2'

const net  = require('net')
const os   = require('os')
const fs   = require('fs')
const { exec } = require('child_process')

const API      = (process.env.IAREST_API  || 'https://www.iarest.es').replace(/\/$/, '')
const TOKEN    = process.env.BRIDGE_TOKEN || ''
const POLL_MS  = parseInt(process.env.POLL_MS || '3000', 10)
const TIMEOUT_MS = 5000

if (!TOKEN) {
  console.error('[BRIDGE] BRIDGE_TOKEN no configurado.')
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

// ── Auto-update ───────────────────────────────────────────────
async function checkUpdate() {
  try {
    log('info', `v${VERSION} - comprobando actualizaciones...`)
    const res = await fetch(`${API}/api/bridge/version`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return
    const { version, url } = await res.json()
    if (version === VERSION) { log('ok', `Bridge actualizado (v${VERSION})`); return }
    log('info', `Nueva version v${version} disponible. Actualizando...`)
    const dl = await fetch(url || `${API}/bridge-local.js`, { signal: AbortSignal.timeout(15000) })
    if (!dl.ok) return
    const code = await dl.text()
    fs.writeFileSync(process.argv[1] || __filename, code, 'utf8')
    log('ok', `Actualizado a v${version}. Reiniciando...`)
    const child = require('child_process').spawn(process.execPath, process.argv.slice(1), {
      detached: true, stdio: 'inherit', env: process.env,
    })
    child.unref()
    process.exit(0)
  } catch (err) {
    log('warn', `Auto-update: ${err.message}`)
  }
}

// ── TCP send ──────────────────────────────────────────────────
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
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout - impresora no responde')) })
    socket.on('error',   err => { if (!sent) reject(err) })
    socket.on('close',   ()  => { if (!sent) reject(new Error('Socket cerrado')) })
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
  } catch (err) {
    log('warn', `Error confirmando ${jobId.slice(0,8)}: ${err.message}`)
  }
}

// ── TCP probe ─────────────────────────────────────────────────
function tcpProbe(ip, port, ms = 500) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(ms)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
    s.on('error',   () => { s.destroy(); resolve(false) })
  })
}

// ── MAC via ARP ───────────────────────────────────────────────
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

// ── Subnet local ──────────────────────────────────────────────
function getSubnet() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const p = iface.address.split('.')
        return { subnet: `${p[0]}.${p[1]}.${p[2]}`, localIp: iface.address }
      }
    }
  }
  return null
}

// ── Escanear subnet ───────────────────────────────────────────
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

// ── Registrar impresora nueva ─────────────────────────────────
async function registrarImpresora(ip, mac, nombre) {
  try {
    const body = { ip_address: ip, port: 9100, nombre, connection_type: 'ip_local' }
    if (mac) body.mac_address = mac
    const r = await fetch(`${API}/api/bridge/register-printer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
      body: JSON.stringify(body),
    })
    const d = await r.json()
    if (d.ok) {
      log('ok', `Registrada: ${nombre} (${ip})${mac ? ' MAC:' + mac : ''}`)
      // Enviar ticket de prueba
      await fetch(`${API}/api/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'test', impresora_id: d.id }),
      }).catch(() => {})
      log('ok', `Ticket de prueba enviado a ${nombre}`)
      return d.id
    }
  } catch (err) {
    log('warn', `Error registrando ${ip}: ${err.message}`)
  }
  return null
}

// ── Discovery completo (rediscovery + nuevas) ─────────────────
let scanning = false
async function discover() {
  if (scanning) return
  scanning = true
  try {
    // Obtener impresoras registradas
    const r = await fetch(`${API}/api/bridge/printers?token=${TOKEN}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return
    const { impresoras } = await r.json()

    const net2 = getSubnet()
    if (!net2) { log('warn', 'No se pudo detectar la red local'); return }

    log('info', `Escaneando red ${net2.subnet}.0/24...`)
    const found = await scanSubnet(net2.subnet)

    if (found.length === 0) {
      log('warn', 'No se encontraron impresoras en la red')
      log('info', 'Verifica que las impresoras esten encendidas y en la misma red WiFi')
      return
    }

    log('info', `${found.length} dispositivo(s) encontrado(s) en puerto 9100`)

    const registradas   = impresoras || []
    const knownIps      = new Set(registradas.map(i => i.ip_address))
    const knownMacs     = new Map(registradas.filter(i => i.mac_address).map(i => [i.mac_address.toLowerCase(), i]))

    let contador = registradas.length + 1

    for (const ip of found) {
      // Obtener MAC
      const mac = await getMac(ip)

      // ¿IP ya registrada?
      if (knownIps.has(ip)) {
        const imp = registradas.find(i => i.ip_address === ip)
        log('ok', `${imp?.nombre || ip} - ${ip} OK`)
        // Actualizar MAC si no la tenía
        if (mac && imp && !imp.mac_address) {
          await fetch(`${API}/api/bridge/update-ip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
            body: JSON.stringify({ impresora_id: imp.id, mac_address: mac, new_ip: ip }),
          }).catch(() => {})
          log('ok', `MAC guardada para ${imp.nombre}: ${mac}`)
        }
        continue
      }

      // ¿MAC conocida con IP diferente? → actualizar IP
      if (mac && knownMacs.has(mac)) {
        const imp = knownMacs.get(mac)
        log('ok', `${imp.nombre}: IP actualizada ${imp.ip_address} -> ${ip}`)
        await fetch(`${API}/api/bridge/update-ip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bridge-token': TOKEN },
          body: JSON.stringify({ impresora_id: imp.id, mac_address: mac, new_ip: ip }),
        }).catch(() => {})
        imp.ip_address = ip
        continue
      }

      // Nueva impresora no registrada → registrar automáticamente
      log('info', `Nueva impresora encontrada: ${ip}${mac ? ' (MAC: ' + mac + ')' : ''}`)
      const nombre = `Impresora ${contador}`
      await registrarImpresora(ip, mac, nombre)
      contador++
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
    if (err.name !== 'TimeoutError') log('warn', `Poll error: ${err.message}`)
  } finally {
    running = false
  }
}

// ── Arranque ──────────────────────────────────────────────────
console.log(`${COL.bold}[ia.rest Bridge] v${VERSION} · token: ${TOKEN.slice(0,8)}...${COL.reset}`)
console.log(`${COL.gray}API: ${API}${COL.reset}`)
console.log('')

checkUpdate()
  .then(() => discover())
  .then(() => {
    log('ok', 'Bridge listo. Esperando jobs...')
    setInterval(poll, POLL_MS)
    poll()
  })

process.on('SIGINT', () => { log('info', 'Deteniendo bridge...'); process.exit(0) })
