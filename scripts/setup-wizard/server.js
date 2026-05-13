#!/usr/bin/env node
'use strict'

// ============================================================
// ia.rest · Setup Wizard v1.0
// Servidor local que abre el navegador con el wizard de
// configuración. Corre en el PC del restaurante.
// ============================================================

const http   = require('http')
const https  = require('https')
const net    = require('net')
const os     = require('os')
const path   = require('path')
const fs     = require('fs')
const { exec } = require('child_process')

const PORT = 9371
const API  = 'https://www.iarest.es'

// ── Obtener IP local ─────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '192.168.1.100'
}

function getSubnet(ip) {
  return ip.split('.').slice(0, 3).join('.')
}

// ── Test TCP ─────────────────────────────────────────────────
function checkTCP(ip, port, timeout = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket()
    let done = false
    const finish = (ok) => { if (done) return; done = true; s.destroy(); resolve(ok) }
    s.setTimeout(timeout)
    s.connect(port, ip, () => finish(true))
    s.on('timeout', () => finish(false))
    s.on('error',   () => finish(false))
  })
}

// ── Enviar ESC/POS ───────────────────────────────────────────
function sendESCPOS(ip, port, buf) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket()
    let sent = false
    s.setTimeout(6000)
    s.connect(port, ip, () => {
      s.write(buf, (err) => {
        if (err) { s.destroy(); return reject(err) }
        setTimeout(() => { s.end(); sent = true; resolve(true) }, 400)
      })
    })
    s.on('timeout', () => { s.destroy(); reject(new Error('Timeout')) })
    s.on('error',   (e) => { if (!sent) reject(e) })
    s.on('close',   ()  => { if (!sent) reject(new Error('Socket cerrado')) })
  })
}

// ── Ticket de test ESC/POS ───────────────────────────────────
function buildTestTicket(restaurantName) {
  const b = []
  const p = (...x) => x.forEach(v => b.push(v))
  const t = (str) => Buffer.from(str, 'utf8').forEach(v => b.push(v))

  p(0x1B,0x40)          // Init
  p(0x1B,0x61,0x01)     // Centro
  p(0x1B,0x21,0x30)     // Grande + negrita
  t('ia.rest')
  p(0x0A)
  p(0x1B,0x21,0x00)     // Normal
  t('Bridge configurado \u2713')
  p(0x0A,0x0A)
  p(0x1B,0x61,0x00)     // Izquierda
  t(`Local: ${(restaurantName||'Test').substring(0,28)}`)
  p(0x0A)
  t(`Fecha: ${new Date().toLocaleString('es-ES')}`)
  p(0x0A,0x0A)
  p(0x1B,0x61,0x01)     // Centro
  t('www.iarest.es')
  p(0x0A,0x0A,0x0A)
  p(0x1D,0x56,0x01)     // Corte parcial

  return Buffer.from(b)
}

// ── Escanear red buscando impresoras (puerto 9100) ───────────
async function scanForPrinters(onProgress) {
  const localIP = getLocalIP()
  const subnet  = getSubnet(localIP)
  const results = []
  const BATCH   = 30  // IPs en paralelo

  onProgress({ type: 'start', subnet, total: 254 })

  for (let start = 1; start <= 254; start += BATCH) {
    const batch = []
    for (let i = start; i < start + BATCH && i <= 254; i++) {
      const ip = `${subnet}.${i}`
      batch.push(
        checkTCP(ip, 9100, 500).then(open => {
          if (open) results.push({ ip, port: 9100 })
          onProgress({ type: 'progress', checked: i, found: results.length })
        })
      )
    }
    await Promise.all(batch)
  }

  onProgress({ type: 'done', found: results })
  return results
}

// ── Llamada a la API de ia.rest ──────────────────────────────
function apiCall(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const options = {
      hostname: 'www.iarest.es',
      port: 443,
      path,
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-bridge-token': token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      }
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) })
        } catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

// ── Instalar como servicio Windows ───────────────────────────
function installWindowsService(token) {
  return new Promise((resolve) => {
    const exePath = process.execPath  // ruta del propio .exe
    const batPath = path.join(os.tmpdir(), 'iarest-bridge-service.bat')

    // Crear .bat que arranca el bridge en background
    const bat = [
      '@echo off',
      `set BRIDGE_TOKEN=${token}`,
      `set IAREST_API=https://www.iarest.es`,
      `start /B "" "${exePath}" --bridge`,
    ].join('\r\n')

    fs.writeFileSync(batPath, bat)

    // Registrar en el inicio de Windows via registro
    const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge" /t REG_SZ /d "${batPath}" /f`

    exec(regCmd, (err) => {
      resolve({ ok: !err, error: err?.message })
    })
  })
}

// ── Servidor HTTP local ──────────────────────────────────────
const publicDir = path.join(__dirname, 'public')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // CORS para dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  // ── API endpoints ─────────────────────────────────────────

  // GET /api/info — IP local y subnet
  if (req.method === 'GET' && url.pathname === '/api/info') {
    const ip = getLocalIP()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ip, subnet: getSubnet(ip) }))
  }

  // POST /api/verify-token — verificar token contra ia.rest
  if (req.method === 'POST' && url.pathname === '/api/verify-token') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { token } = JSON.parse(body)
        const r = await apiCall('/api/bridge/verify', 'POST', { token }, null)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: r.status === 200, data: r.body }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  // GET /api/scan — escanear red (SSE streaming)
  if (req.method === 'GET' && url.pathname === '/api/scan') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

    try {
      await scanForPrinters(send)
    } catch (e) {
      send({ type: 'error', error: e.message })
    }
    return res.end()
  }

  // POST /api/test-printer — test TCP + ticket de prueba
  if (req.method === 'POST' && url.pathname === '/api/test-printer') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { ip, port, restaurantName } = JSON.parse(body)
        const p = parseInt(port) || 9100

        // Paso 1: test TCP
        const tcpOk = await checkTCP(ip, p, 3000)
        if (!tcpOk) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ ok: false, step: 'tcp', error: `No se puede conectar a ${ip}:${p}` }))
        }

        // Paso 2: enviar ticket
        const ticket = buildTestTicket(restaurantName || 'ia.rest')
        await sendESCPOS(ip, p, ticket)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ip, port: p }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, step: 'print', error: e.message }))
      }
    })
    return
  }

  // POST /api/register-printer — registrar impresora en ia.rest
  if (req.method === 'POST' && url.pathname === '/api/register-printer') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { token, ip, port, nombre, seccion_id } = JSON.parse(body)
        const r = await apiCall('/api/bridge/register-printer', 'POST', {
          ip_address: ip,
          port: parseInt(port) || 9100,
          nombre: nombre || `Impresora ${ip}`,
          connection_type: 'ip_local',
          seccion_id: seccion_id || null,
        }, token)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: r.status === 200 || r.status === 201, data: r.body }))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  // POST /api/install-service — instalar bridge como servicio Windows
  if (req.method === 'POST' && url.pathname === '/api/install-service') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { token } = JSON.parse(body)
        const result = await installWindowsService(token)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: e.message }))
      }
    })
    return
  }

  // ── Servir archivos estáticos ─────────────────────────────
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname
  filePath = path.join(publicDir, filePath)

  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
  }

  try {
    const data = fs.readFileSync(filePath)
    const ext  = path.extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  ia.rest Setup Wizard`)
  console.log(`  Abriendo navegador en ${url}...\n`)

  // Abrir navegador según plataforma
  const platform = process.platform
  if (platform === 'win32') {
    exec(`start ${url}`)
  } else if (platform === 'darwin') {
    exec(`open ${url}`)
  } else {
    exec(`xdg-open ${url}`)
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Puerto ${PORT} ocupado. Cierra otras instancias del wizard.\n`)
  } else {
    console.error('Error:', e.message)
  }
  process.exit(1)
})
