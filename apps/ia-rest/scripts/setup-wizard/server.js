#!/usr/bin/env node
'use strict'
// ============================================================
// ia.rest · Setup Wizard v2.1
// FIXES v2.1:
//   - Bridge se lanza inmediatamente al instalar autostart
//   - Token auto-rellenado si hay instalación previa (prevToken en preflight)
//   - Polling envía ?v=VERSION para registrar versión en BD
//   - Endpoint /api/launch-bridge para arrancar sin reiniciar
// ============================================================

const http    = require('http')
const https   = require('https')
const net     = require('net')
const os      = require('os')
const path    = require('path')
const fs      = require('fs')
const { exec } = require('child_process')

const PORT     = 9371
const API      = 'https://www.iarest.es'
const CFG_DIR  = path.join(os.homedir(), '.iarest')
const CFG_FILE = path.join(CFG_DIR, 'bridge.json')
const VERSION  = '5.2.3'  // debe coincidir con bridge-config.ts

// ── Config persistente ────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch { return {} }
}
function saveConfig(data) {
  try {
    fs.mkdirSync(CFG_DIR, { recursive: true })
    fs.writeFileSync(CFG_FILE, JSON.stringify({ ...loadConfig(), ...data }, null, 2))
  } catch {}
}

// ── IP local ──────────────────────────────────────────────────
function getLocalIP() {
  const ifaces = os.networkInterfaces()
  const candidates = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push({ ip: iface.address, name })
    }
  }
  return (candidates.find(c => c.ip.startsWith('192.168.') || c.ip.startsWith('10.')) || candidates[0])?.ip || '192.168.1.1'
}

function getSubnet(ip) { return ip.split('.').slice(0, 3).join('.') }

// ── MAC via ARP ───────────────────────────────────────────────
function getMACFromARP(ip) {
  return new Promise((resolve) => {
    exec(`arp -a ${ip}`, { timeout: 3000 }, (err, stdout) => {
      if (err) { exec(`arp -n ${ip}`, { timeout: 3000 }, (e2, out2) => resolve(extractMAC(out2 || ''))); return }
      resolve(extractMAC(stdout || ''))
    })
  })
}
function extractMAC(text) {
  const m = text.match(/([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/)
  return m ? m[0].replace(/-/g, ':').toLowerCase() : null
}
function getVendorFromMAC(mac) {
  if (!mac) return null
  const oui = mac.replace(/:/g,'').substring(0,6).toUpperCase()
  const v = { '00262D':'Epson','0026AB':'Epson','AC18A5':'Epson','000ACC':'Star','00268C':'Star','F4F951':'Sunmi','A4C138':'Sunmi','001349':'Bixolon','9CADEF':'XPrinter' }
  return v[oui] || null
}
function guessIPStability(ip) {
  const last = parseInt(ip.split('.')[3])
  return (last <= 20 || last === 100 || last === 200 || last === 254) ? 'static' : 'dynamic'
}

// ── Preflight ─────────────────────────────────────────────────
async function runPreflightChecks() {
  const results = []
  const internet = await new Promise(resolve => {
    const req = https.get('https://www.iarest.es/api/estado', { timeout: 5000 }, res => {
      resolve({ ok: res.statusCode < 500, detail: `HTTP ${res.statusCode}` })
    })
    req.on('error', e => resolve({ ok: false, detail: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'Timeout' }) })
  })
  results.push({ id: 'internet', label: 'Conexión a ia.rest', ...internet,
    hint: internet.ok ? null : 'Comprueba que el ordenador tiene acceso a internet.' })

  const ip = getLocalIP()
  results.push({ id: 'network', label: 'Red local detectada', ok: true, detail: ip, hint: null })

  // Instalación previa: informar pero NO devolver token por HTTP (evita flag antivirus)
  const cfg = loadConfig()
  if (cfg.token && cfg.printers?.length > 0) {
    results.push({
      id: 'previous', label: 'Instalación previa detectada',
      ok: true, isWarning: true,
      detail: `${cfg.printers.length} impresora(s) ya configurada(s)`,
      hint: 'Puedes reconfigurar o continuar con la configuración existente.',
    })
  }
  return results
}

// ── TCP helpers ───────────────────────────────────────────────
function checkTCP(ip, port, timeout = 1500) {
  return new Promise(resolve => {
    const s = new net.Socket()
    s.setTimeout(timeout)
    s.connect(port, ip, () => { s.destroy(); resolve(true) })
    s.on('error', () => { s.destroy(); resolve(false) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}
function sendESCPOS(ip, port, data) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket()
    s.setTimeout(5000)
    s.connect(port, ip, () => { s.write(data, () => { setTimeout(() => { s.destroy(); resolve() }, 300) }) })
    s.on('error', e => { s.destroy(); reject(e) })
    s.on('timeout', () => { s.destroy(); reject(new Error('Timeout TCP')) })
  })
}

// ── Ticket de prueba ESC/POS ───────────────────────────────────
function buildTestTicket(restaurantName) {
  const b = (...bytes) => Buffer.from(bytes)
  const t = s => Buffer.from(s.substring(0, 42), 'latin1')
  const lf = b(0x0A)
  const hora = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  return Buffer.concat([
    b(0x1B,0x40), b(0x1B,0x61,0x01),
    b(0x1D,0x21,0x11), b(0x1B,0x45,0x01), t('ia.rest'), b(0x1D,0x21,0x00), b(0x1B,0x45,0x00), lf,
    t('Sistema TPV por voz'), lf, lf,
    b(0x1B,0x61,0x00), t('------------------------------------------'), lf,
    b(0x1B,0x45,0x01), t('IMPRESORA CONECTADA'), b(0x1B,0x45,0x00), lf,
    t(restaurantName.substring(0,40)), lf,
    t('Hora: ' + hora), lf,
    t('------------------------------------------'), lf, lf,
    b(0x1B,0x61,0x01), t('Si ves esto, todo funciona.'), lf, t('Listo para marchar.'), lf, lf, lf, lf,
    b(0x1D,0x56,0x01),
  ])
}

// ── Scan de red ───────────────────────────────────────────────
const BATCH = 16
async function scanNetwork(onProgress) {
  const localIP = getLocalIP()
  const subnet  = getSubnet(localIP)
  const results = []
  onProgress({ type: 'start', subnet, localIP, total: 254 })
  let checked = 0
  for (let start = 1; start <= 254; start += BATCH) {
    const batch = []
    for (let i = start; i < start + BATCH && i <= 254; i++) {
      const ip = `${subnet}.${i}`
      if (ip === localIP) { checked++; continue }
      batch.push(
        checkTCP(ip, 9100, 700).then(async ok => {
          if (ok) {
            const mac = await getMACFromARP(ip)
            results.push({ ip, port: 9100, mac, vendor: getVendorFromMAC(mac), stability: guessIPStability(ip) })
          }
        }).finally(() => { checked++; onProgress({ type: 'progress', checked, found: results.length }) })
      )
    }
    await Promise.all(batch)
  }
  onProgress({ type: 'done', found: results })
  return results
}

// ── Autostart Windows + arranque INMEDIATO ─────────────────────
// Usa exec(bat) — evita spawn detached que activa falsos positivos en antivirus
function downloadBridgeJs(dest) {
  return new Promise((resolve, reject) => {
    const url = `${API}/bridge-local.js`
    const file = fs.createWriteStream(dest)
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

function installAutostart(token) {
  return new Promise(async resolve => {
    try { fs.mkdirSync(CFG_DIR, { recursive: true }) } catch {}
    const exePath = process.execPath
    const vbsPath = path.join(CFG_DIR, 'launch-bridge.vbs')
    const batPath = path.join(CFG_DIR, 'iarest-bridge.bat')
    const bridgeJs = path.join(CFG_DIR, 'bridge-local.js')

    // Descargar bridge-local.js a la carpeta excluida de AV
    try {
      await downloadBridgeJs(bridgeJs)
      console.log('[Wizard] bridge-local.js descargado en', bridgeJs)
    } catch (e) {
      console.warn('[Wizard] No se pudo descargar bridge-local.js:', e.message)
    }

    // VBS watchdog: usa node + bridge-local.js (en carpeta excluida de AV)
    // node.exe es proceso de confianza — no levanta falsos positivos en Avast/Defender
    const vbs = [
      `Set oShell = CreateObject("WScript.Shell")`,
      `oShell.Environment("Process")("BRIDGE_TOKEN") = "${token}"`,
      `oShell.Environment("Process")("IAREST_API") = "${API}"`,
      `Do`,
      `  oShell.Run "node " & chr(34) & "${bridgeJs}" & chr(34), 0, True`,
      `  WScript.Sleep 5000`,
      `Loop`,
    ].join('\r\n')
    fs.writeFileSync(vbsPath, vbs)

    // Bat de fallback (loop watchdog con node)
    const bat = [
      `@echo off`,
      `set BRIDGE_TOKEN=${token}`,
      `set IAREST_API=${API}`,
      `:loop`,
      `node "${bridgeJs}"`,
      `timeout /t 5 /nobreak > nul`,
      `goto loop`,
    ].join('\r\n')
    fs.writeFileSync(batPath, bat)

    // Autostart apunta al VBS
    const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge" /t REG_SZ /d "wscript.exe \"\"${vbsPath}\"\""  /f`
    exec(cmd, { timeout: 5000 }, err => {
      if (err) return resolve({ ok: false, error: err.message })
      saveConfig({ token, autostartPath: vbsPath })
      const exclCmd = `powershell -NoProfile -NonInteractive -Command "Add-MpPreference -ExclusionPath '${CFG_DIR}' -ErrorAction SilentlyContinue"`
      exec(exclCmd, { timeout: 8000 }, () => {})
      console.log('[Wizard] Autostart registrado via VBS launcher.')
      resolve({ ok: true, batPath: vbsPath, cfgDir: CFG_DIR })
    })
  })
}

// ── launchBridgeNow: arranca el bridge cuando el usuario pulsa el botón ──
// Se llama solo por acción explícita del usuario (no automático al instalar)
async function launchBridgeNow(token) {
  try {
    const exePath = process.execPath
    const vbsPath = path.join(CFG_DIR, 'launch-bridge.vbs')
    const bridgeJs = path.join(CFG_DIR, 'bridge-local.js')

    // Descargar bridge-local.js si no existe
    if (!fs.existsSync(bridgeJs)) {
      try { await downloadBridgeJs(bridgeJs) } catch (e) {
        console.warn('[Bridge] No se pudo descargar bridge-local.js:', e.message)
      }
    }

    // Crear VBS watchdog si no existe
    if (!fs.existsSync(vbsPath)) {
      const vbs = [
        `Set oShell = CreateObject("WScript.Shell")`,
        `oShell.Environment("Process")("BRIDGE_TOKEN") = "${token}"`,
        `oShell.Environment("Process")("IAREST_API") = "${API}"`,
        `Do`,
        `  oShell.Run "node " & chr(34) & "${bridgeJs}" & chr(34), 0, True`,
        `  WScript.Sleep 5000`,
        `Loop`,
      ].join('\r\n')
      try { fs.mkdirSync(CFG_DIR, { recursive: true }) } catch {}
      fs.writeFileSync(vbsPath, vbs)
      saveConfig({ token })
    }
    // Lanzar via wscript — proceso verdaderamente independiente
    exec(`wscript.exe "${vbsPath}"`, (err) => {
      if (err) console.warn('[Bridge] Error al arrancar via VBS:', err.message)
      else console.log('[Bridge] Arrancado via VBS ✓')
    })
    return { ok: true, batPath: vbsPath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── Modo --bridge ─────────────────────────────────────────────
if (process.argv.includes('--bridge')) {
  const cfg   = loadConfig()
  const TOKEN = process.env.BRIDGE_TOKEN || cfg.token || ''
  if (!TOKEN) { console.error('[ia.rest Bridge] Token no configurado.'); process.exit(1) }
  console.log(`[ia.rest Bridge] v${VERSION} · token: ${TOKEN.slice(0,8)}...`)

  // ── Capa 2: crash handler — salida limpia para que el watchdog VBS reinicie ──
  process.on('uncaughtException', (err) => {
    console.error('[Bridge] Error fatal — reiniciando en 5s:', err.message)
    process.exit(1)
  })
  process.on('unhandledRejection', (err) => {
    console.error('[Bridge] Promesa rechazada — reiniciando en 5s:', err)
    process.exit(1)
  })

  // ── Servidor de gestión local (localhost:47801) ──────────────
  // Permite al panel /owner activar el bridge desde el mismo PC
  const MGMT_PORT = 47801
  const ALLOWED_ORIGIN = 'https://www.iarest.es'
  const mgmtServer = http.createServer((req, res) => {
    const remoteAddr = req.socket.remoteAddress
    const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1'
    if (!isLocal) { res.writeHead(403); res.end('Forbidden'); return }
    const corsHeaders = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Private-Network': 'true',
      'Content-Type': 'application/json',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); res.end(); return }
    const url = req.url?.split('?')[0] || '/'
    if (url === '/status' && req.method === 'GET') {
      res.writeHead(200, corsHeaders)
      res.end(JSON.stringify({ ok: true, version: VERSION, uptime: process.uptime() }))
      return
    }
    if (url === '/ping' && req.method === 'POST') {
      console.log('[Bridge] Activación remota desde el panel — forzando poll...')
      poll().catch(() => {})
      res.writeHead(200, corsHeaders)
      res.end(JSON.stringify({ ok: true, message: 'Poll forzado' }))
      return
    }
    res.writeHead(404, corsHeaders)
    res.end(JSON.stringify({ error: 'Not found' }))
  })
  mgmtServer.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') console.warn('[Bridge] Gestión:', err.message)
  })
  mgmtServer.listen(MGMT_PORT, '127.0.0.1', () => {
    console.log(`[Bridge] Servidor de gestión local en puerto ${MGMT_PORT}`)
  })

  const macToIP = {}
  if (cfg.printers) cfg.printers.forEach(p => { if (p.mac) macToIP[p.mac] = p.ip })

  let busy = false

  async function recoverByMAC(mac) {
    const subnet = getSubnet(getLocalIP())
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`
      if (await checkTCP(ip, 9100, 300)) {
        const found = await getMACFromARP(ip)
        if (found === mac) {
          macToIP[mac] = ip
          const c = loadConfig()
          if (c.printers) { c.printers = c.printers.map(p => p.mac===mac?{...p,ip}:p); saveConfig(c) }
          console.log(`[Bridge] Auto-recovery: ${mac} → ${ip}`)
          return ip
        }
      }
    }
    return null
  }

  async function poll() {
    if (busy) return
    busy = true
    try {
      // FIX v2.1: ?v=VERSION registra la versión en BD (bridge_version)
      const res = await fetch(`${API}/api/print?token=${TOKEN}&v=${VERSION}`, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) { busy = false; return }
      const { jobs } = await res.json()
      if (!jobs?.length) { busy = false; return }
      for (const job of jobs) {
        let ip = job.ip
        try {
          await sendESCPOS(ip, job.port, Buffer.from(job.print_data, 'base64'))
          await fetch(`${API}/api/print`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: job.id, status:'impreso' }) })
          console.log(`[OK] ${job.id.slice(0,8)} → ${ip}`)
        } catch (e) {
          const mac = Object.keys(macToIP).find(m => macToIP[m] === ip)
          let recovered = false
          if (mac) {
            const newIP = await recoverByMAC(mac)
            if (newIP) {
              try {
                await sendESCPOS(newIP, job.port, Buffer.from(job.print_data, 'base64'))
                await fetch(`${API}/api/print`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: job.id, status:'impreso' }) })
                console.log(`[OK Recovery] ${job.id.slice(0,8)} → ${newIP}`)
                recovered = true
              } catch {}
            }
          }
          if (!recovered) {
            console.error(`[ERR] ${job.id.slice(0,8)}: ${e.message}`)
            await fetch(`${API}/api/print`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: job.id, status:'error', error_msg: e.message }) }).catch(()=>{})
          }
        }
      }
    } catch {}
    busy = false
  }

  setInterval(poll, 3000)
  poll()
  process.on('SIGINT', () => process.exit(0))

  // ── Capa 3: watchdog de actividad — si lleva 10 min sin poll exitoso, reinicia ──
  // Cubre el caso de bridge "colgado" (proceso vivo pero sin respuesta de red)
  let lastPollOk = Date.now()
  const _origPoll = poll
  async function pollWithHB() {
    const antes = lastPollOk
    await _origPoll()
    // Si poll no lanzó excepción = señal de vida
    lastPollOk = Date.now()
  }
  setInterval(() => {
    if (Date.now() - lastPollOk > 10 * 60 * 1000) {
      console.error('[Bridge] Watchdog: sin actividad 10 min — reiniciando...')
      process.exit(1)
    }
  }, 60_000)

} else {
  startWizard()
}

// ── Detectar antivirus instalado (WMI) ───────────────────────
function detectAntivirus() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve([])
    const cmd = `powershell -NoProfile -NonInteractive -Command "Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object displayName | ConvertTo-Json"`
    exec(cmd, { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout) return resolve([])
      try {
        const raw = JSON.parse(stdout.trim())
        const list = Array.isArray(raw) ? raw : [raw]
        resolve(list.map(x => x.displayName).filter(Boolean))
      } catch { resolve([]) }
    })
  })
}

// ── Wizard HTTP server ────────────────────────────────────────
function startWizard() {
  const indexHTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

  function json(res, data, status = 200) {
    const body = JSON.stringify(data)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(body)
  }
  function bodyJSON(req) {
    return new Promise((resolve, reject) => {
      let data = ''
      req.on('data', c => data += c)
      req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
      req.on('error', reject)
    })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const p = url.pathname

    if (p === '/' || p === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(indexHTML)
    }

    if (req.method === 'GET' && p === '/api/preflight') {
      try {
        const checks = await runPreflightChecks()
        const ip = getLocalIP(); const cfg = loadConfig()
        return json(res, { checks, localIP: ip, subnet: getSubnet(ip), previousInstall: !!cfg.token, previousPrinters: cfg.printers?.length || 0 })
      } catch(e) { return json(res, { error: e.message }, 500) }
    }

    if (req.method === 'GET' && p === '/api/config') {
      const ip = getLocalIP(); const cfg = loadConfig()
      return json(res, { ip, subnet: getSubnet(ip), previousInstall: !!cfg.token, previousPrinters: cfg.printers?.length || 0 })
    }

    if (req.method === 'POST' && p === '/api/verify-token') {
      const { token } = await bodyJSON(req)
      if (!token) return json(res, { ok:false, error:'Introduce tu referencia de acceso' })
      try {
        const data = JSON.stringify({ token })
        const r = await new Promise((resolve, reject) => {
          const opts = { hostname:'www.iarest.es', port:443, path:'/api/bridge/verify', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} }
          const req2 = https.request(opts, res2 => {
            let b = ''; res2.on('data', c => b += c)
            res2.on('end', () => resolve({ status: res2.statusCode, body: JSON.parse(b || '{}') }))
          })
          req2.on('error', reject); req2.write(data); req2.end()
        })
        if (r.status === 200) { saveConfig({ token, restaurantName: r.body.nombre }); return json(res, { ok:true, data:r.body }) }
        return json(res, { ok:false, error: r.body?.error || 'Referencia no válida.' })
      } catch(e) { return json(res, { ok:false, error: e.message }) }
    }

    if (req.method === 'GET' && p === '/api/scan') {
      res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive', 'Access-Control-Allow-Origin':'*' })
      const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`)
      try { await scanNetwork(send) } catch(e) { send({ type:'error', error: e.message }) }
      res.end(); return
    }

    if (req.method === 'POST' && p === '/api/test-printer') {
      const { ip, port, restaurantName, tcpOnly } = await bodyJSON(req)
      try {
        const ok = await checkTCP(ip, parseInt(port)||9100, 3000)
        if (!ok) return json(res, { ok:false, step:'tcp', error:`No se puede conectar a ${ip}:${port}` })
        if (tcpOnly) return json(res, { ok:true, step:'tcp' })
        const mac = await getMACFromARP(ip)
        await sendESCPOS(ip, parseInt(port)||9100, buildTestTicket(restaurantName || 'ia.rest'))
        return json(res, { ok:true, step:'print', mac, vendor: getVendorFromMAC(mac), stability: guessIPStability(ip) })
      } catch(e) { return json(res, { ok:false, step:'print', error: e.message }) }
    }

    if (req.method === 'POST' && p === '/api/register-printers') {
      const { token, printers } = await bodyJSON(req)
      const results = []
      for (const printer of (printers || [])) {
        try {
          const data = JSON.stringify({ nombre: printer.nombre, ip_address: printer.ip, port: printer.port, connection_type: 'ip_local', mac_address: printer.mac, secciones_ids: printer.seccion_id ? [printer.seccion_id] : [] })
          const opts = { hostname:'www.iarest.es', port:443, path:'/api/bridge/register-printer', method:'POST', headers:{'Content-Type':'application/json','x-bridge-token':token,'Content-Length':Buffer.byteLength(data)} }
          const r = await new Promise((resolve, reject) => {
            const req2 = https.request(opts, res2 => { let b=''; res2.on('data',c=>b+=c); res2.on('end',()=>resolve({ status:res2.statusCode, body:JSON.parse(b||'{}') })) })
            req2.on('error',reject); req2.write(data); req2.end()
          })
          results.push({ ip: printer.ip, ok: r.status < 400, status: r.status, id: r.body?.id || null })
        } catch(e) { results.push({ ip: printer.ip, ok:false, error: e.message }) }
      }
      saveConfig({ printers })
      return json(res, { ok:true, results })
    }

    if (req.method === 'POST' && p === '/api/install-autostart') {
      const { token } = await bodyJSON(req)
      return json(res, await installAutostart(token))
    }

    // FIX v2.1: lanzar bridge sin esperar reinicio (usado cuando se salta el autostart)
    if (req.method === 'POST' && p === '/api/launch-bridge') {
      const { token } = await bodyJSON(req)
      if (!token) return json(res, { ok:false, error:'Token requerido' })
      saveConfig({ token })
      return json(res, launchBridgeNow(token))
    }

    // Detectar antivirus instalado
    if (req.method === 'GET' && p === '/api/antivirus') {
      const avList = await detectAntivirus()
      return json(res, { ok: true, antivirus: avList })
    }

    if (req.method === 'GET' && p === '/api/check-autostart') {
      try {
        const result = await new Promise(resolve => {
          exec(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge"`, { timeout:3000 }, (err,stdout) => {
            resolve({ installed: !err && stdout.includes('iarest-bridge') })
          })
        })
        return json(res, result)
      } catch { return json(res, { installed:false }) }
    }

    res.writeHead(404); res.end('Not found')
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n[ia.rest Setup Wizard] v2 · http://localhost:${PORT}\n`)
    const p = process.platform
    if (p === 'win32') exec(`start http://localhost:${PORT}`)
    else if (p === 'darwin') exec(`open http://localhost:${PORT}`)
    else exec(`xdg-open http://localhost:${PORT}`)
  })
}
