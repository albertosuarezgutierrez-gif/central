#!/usr/bin/env node
'use strict'
// ============================================================
// ia.rest · Setup Wizard v2.0
// ============================================================

const http    = require('http')
const https   = require('https')
const net     = require('net')
const os      = require('os')
const path    = require('path')
const fs      = require('fs')
const { exec } = require('child_process')

const PORT    = 9371
const API     = 'https://www.iarest.es'
const CFG_DIR = path.join(os.homedir(), '.iarest')
const CFG_FILE= path.join(CFG_DIR, 'bridge.json')

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
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ ip: iface.address, name })
      }
    }
  }
  return (candidates.find(c => c.ip.startsWith('192.168.') || c.ip.startsWith('10.')) || candidates[0])?.ip || '192.168.1.1'
}

function getSubnet(ip) {
  return ip.split('.').slice(0, 3).join('.')
}

// ── MAC via ARP ───────────────────────────────────────────────
function getMACFromARP(ip) {
  return new Promise((resolve) => {
    exec(`arp -a ${ip}`, { timeout: 3000 }, (err, stdout) => {
      if (err) {
        exec(`arp -n ${ip}`, { timeout: 3000 }, (e2, out2) => resolve(extractMAC(out2 || '')))
        return
      }
      resolve(extractMAC(stdout || ''))
    })
  })
}

function extractMAC(text) {
  const m = text.match(/([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}/)
  return m ? m[0].replace(/-/g, ':').toLowerCase() : null
}

// ── Fabricante por MAC (OUI) ───────────────────────────────────
function getVendorFromMAC(mac) {
  if (!mac) return null
  const oui = mac.replace(/:/g,'').substring(0,6).toUpperCase()
  const v = { '00262D':'Epson','0026AB':'Epson','AC18A5':'Epson','000ACC':'Star','00268C':'Star','F4F951':'Sunmi','A4C138':'Sunmi','001349':'Bixolon','9CADEF':'XPrinter' }
  return v[oui] || null
}

// ── Estabilidad IP ────────────────────────────────────────────
function guessIPStability(ip) {
  const last = parseInt(ip.split('.')[3])
  return (last <= 20 || last === 100 || last === 200 || last === 254) ? 'static' : 'dynamic'
}

// ── Preflight ─────────────────────────────────────────────────
async function runPreflightChecks() {
  const results = []

  // Internet
  const internet = await new Promise(resolve => {
    const req = https.get('https://www.iarest.es/api/estado', { timeout: 5000 }, res => {
      resolve({ ok: res.statusCode < 500, detail: `HTTP ${res.statusCode}` })
    })
    req.on('error', e => resolve({ ok: false, detail: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, detail: 'Timeout' }) })
  })
  results.push({ id: 'internet', label: 'Conexión a ia.rest', ...internet,
    hint: internet.ok ? null : 'Comprueba que el ordenador tiene acceso a internet.' })

  // Red local
  const ip = getLocalIP()
  const ifaces = os.networkInterfaces()
  const localIPs = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) localIPs.push({ name, ip: iface.address })
    }
  }
  results.push({
    id: 'network', label: 'Red local detectada',
    ok: localIPs.length > 0,
    detail: localIPs.length > 0 ? `${ip}` : 'Sin red detectada',
    hint: localIPs.length > 1 ? `${localIPs.length} interfaces detectadas — se usará ${ip}` : null
  })

  // Instalación previa
  const cfg = loadConfig()
  if (cfg.token && cfg.printers?.length > 0) {
    results.push({
      id: 'previous', label: 'Instalación previa detectada',
      ok: true, isWarning: true,
      detail: `${cfg.printers.length} impresora(s) ya configurada(s)`,
      hint: 'Puedes reconfigurar o continuar con la configuración existente.'
    })
  }

  return results
}

// ── TCP ───────────────────────────────────────────────────────
function checkTCP(ip, port, timeout = 500) {
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

// ── ESC/POS ───────────────────────────────────────────────────
function sendESCPOS(ip, port, buf) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket()
    let sent = false
    s.setTimeout(6000)
    s.connect(port, ip, () => {
      s.write(buf, err => {
        if (err) { s.destroy(); return reject(err) }
        setTimeout(() => { s.end(); sent = true; resolve(true) }, 400)
      })
    })
    s.on('timeout', () => { s.destroy(); reject(new Error('Timeout — impresora no responde')) })
    s.on('error',   e  => { if (!sent) reject(new Error(`Error conexión: ${e.message}`)) })
    s.on('close',   () => { if (!sent) reject(new Error('Conexión cerrada antes de enviar')) })
  })
}

// ── Ticket de prueba ──────────────────────────────────────────
function buildTestTicket(name) {
  const b = []
  const p = (...x) => x.forEach(v => b.push(v))
  const t = str => Buffer.from(str,'utf8').forEach(v => b.push(v))
  p(0x1B,0x40); p(0x1B,0x61,0x01); p(0x1B,0x21,0x30); t('ia.rest'); p(0x0A)
  p(0x1B,0x21,0x00); t('Impresora configurada \u2713'); p(0x0A,0x0A)
  p(0x1B,0x61,0x00); t(`Local: ${(name||'Test').substring(0,28)}`); p(0x0A)
  t(`Fecha: ${new Date().toLocaleString('es-ES')}`); p(0x0A,0x0A)
  p(0x1B,0x61,0x01); t('www.iarest.es'); p(0x0A,0x0A,0x0A)
  p(0x1D,0x56,0x01)
  return Buffer.from(b)
}

// ── Scan de red ───────────────────────────────────────────────
async function scanForPrinters(onProgress) {
  const localIP = getLocalIP()
  const subnet  = getSubnet(localIP)
  const results = []
  const BATCH   = 40

  onProgress({ type: 'start', subnet, localIP, total: 254 })

  for (let start = 1; start <= 254; start += BATCH) {
    const batch = []
    for (let i = start; i < start + BATCH && i <= 254; i++) {
      const ip = `${subnet}.${i}`
      if (ip === localIP) continue
      batch.push(
        checkTCP(ip, 9100, 500).then(async open => {
          if (open) {
            const mac       = await getMACFromARP(ip)
            const stability = guessIPStability(ip)
            const vendor    = getVendorFromMAC(mac)
            results.push({ ip, port: 9100, mac, stability, vendor })
          }
          onProgress({ type: 'progress', checked: i, found: results.length })
        })
      )
    }
    await Promise.all(batch)
  }

  onProgress({ type: 'done', found: results })
  return results
}

// ── Autostart Windows (HKCU — sin admin) ─────────────────────
function installAutostart(token) {
  return new Promise(resolve => {
    try { fs.mkdirSync(CFG_DIR, { recursive: true }) } catch {}
    const exePath = process.execPath
    const batPath = path.join(CFG_DIR, 'iarest-bridge.bat')
    const bat = [`@echo off`, `set BRIDGE_TOKEN=${token}`, `set IAREST_API=${API}`, `start /B "" "${exePath}" --bridge`].join('\r\n')
    fs.writeFileSync(batPath, bat)

    const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge" /t REG_SZ /d "${batPath}" /f`
    exec(cmd, { timeout: 5000 }, err => {
      if (err) return resolve({ ok: false, error: err.message })
      saveConfig({ token, autostartPath: batPath })
      resolve({ ok: true })
    })
  })
}

// ── Modo --bridge ─────────────────────────────────────────────
if (process.argv.includes('--bridge')) {
  const cfg   = loadConfig()
  const TOKEN = process.env.BRIDGE_TOKEN || cfg.token || ''
  if (!TOKEN) { console.error('[ia.rest Bridge] Token no configurado.'); process.exit(1) }
  console.log(`[ia.rest Bridge] v2 · token: ${TOKEN.slice(0,8)}...`)

  // Mapa MAC→IP para auto-recovery
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
      const res = await fetch(`${API}/api/print?token=${TOKEN}`, { signal: AbortSignal.timeout(10000) })
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
          // Auto-recovery por MAC si la IP cambió
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

} else {
  startWizard()
}

// ── Wizard ────────────────────────────────────────────────────
function startWizard() {

const publicDir = path.join(__dirname, 'public')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const json = (data, s = 200) => { res.writeHead(s, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)) }
  const body = () => new Promise(resolve => {
    let b = ''; req.on('data', d => b+=d); req.on('end', () => { try { resolve(JSON.parse(b)) } catch { resolve({}) } })
  })

  if (req.method==='GET' && url.pathname==='/api/info') {
    const ip = getLocalIP(); const cfg = loadConfig()
    return json({ ip, subnet: getSubnet(ip), previousInstall: !!cfg.token, previousPrinters: cfg.printers?.length || 0 })
  }

  if (req.method==='GET' && url.pathname==='/api/preflight') {
    return json({ checks: await runPreflightChecks() })
  }

  if (req.method==='POST' && url.pathname==='/api/verify-token') {
    const { token } = await body()
    if (!token) return json({ ok:false, error:'Introduce tu referencia de acceso' })
    try {
      const data = JSON.stringify({ token })
      const r = await new Promise((resolve, reject) => {
        const opts = { hostname:'www.iarest.es', port:443, path:'/api/bridge/verify', method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)} }
        const req2 = https.request(opts, res2 => { let raw=''; res2.on('data',d=>raw+=d); res2.on('end',()=>{ try{resolve({status:res2.statusCode,body:JSON.parse(raw)})}catch{resolve({status:res2.statusCode,body:{}})} }) })
        req2.on('error', reject)
        req2.setTimeout(8000, () => req2.destroy(new Error('Timeout')))
        req2.write(data); req2.end()
      })
      if (r.status===200) { saveConfig({ token, restaurantName: r.body.nombre }); return json({ ok:true, data:r.body }) }
      return json({ ok:false, error:'Referencia no válida. Revisa el email de bienvenida.' })
    } catch(e) { return json({ ok:false, error:`Sin conexión: ${e.message}` }) }
  }

  if (req.method==='GET' && url.pathname==='/api/scan') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'})
    const send = d => { try { res.write(`data: ${JSON.stringify(d)}\n\n`) } catch {} }
    try { await scanForPrinters(send) } catch(e) { send({ type:'error', error:e.message }) }
    return res.end()
  }

  if (req.method==='POST' && url.pathname==='/api/test-printer') {
    const { ip, port, restaurantName } = await body()
    const p = parseInt(port)||9100
    const tcpOk = await checkTCP(ip, p, 4000)
    if (!tcpOk) return json({ ok:false, step:'tcp', error:`No se puede conectar a ${ip}:${p}`, hint:'Comprueba que la impresora está encendida, con papel y conectada al router por cable.' })
    const mac = await getMACFromARP(ip)
    try {
      await sendESCPOS(ip, p, buildTestTicket(restaurantName||'ia.rest'))
      return json({ ok:true, ip, port:p, mac, stability:guessIPStability(ip), vendor:getVendorFromMAC(mac) })
    } catch(e) {
      return json({ ok:false, step:'print', error:e.message, hint:'La impresora responde pero no imprime. Comprueba que no está en uso por Ágora u otro programa, y que tiene papel.' })
    }
  }

  if (req.method==='POST' && url.pathname==='/api/register-printers') {
    const { token, printers } = await body()
    const results = []
    for (const p of (printers||[])) {
      try {
        const data = JSON.stringify({ ip_address:p.ip, port:p.port||9100, nombre:p.nombre, connection_type:'ip_local', seccion_id:p.seccion_id||null, mac_address:p.mac||null })
        const r = await new Promise((resolve, reject) => {
          const opts = { hostname:'www.iarest.es', port:443, path:'/api/bridge/register-printer', method:'POST', headers:{'Content-Type':'application/json','x-bridge-token':token,'Content-Length':Buffer.byteLength(data)} }
          const req2 = https.request(opts, res2 => { let raw=''; res2.on('data',d=>raw+=d); res2.on('end',()=>{ try{resolve({status:res2.statusCode})}catch{resolve({status:500})} }) })
          req2.on('error', reject); req2.write(data); req2.end()
        })
        results.push({ ip:p.ip, ok: r.status<=201 })
      } catch(e) { results.push({ ip:p.ip, ok:false, error:e.message }) }
    }
    saveConfig({ printers })
    return json({ ok:true, results })
  }

  if (req.method==='POST' && url.pathname==='/api/install-autostart') {
    const { token } = await body()
    return json(await installAutostart(token))
  }

  if (req.method==='GET' && url.pathname==='/api/config') {
    return json(loadConfig())
  }

  if (req.method==='GET' && url.pathname==='/api/check-autostart') {
    return new Promise(resolve => {
      exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "iarest-bridge"', (err, stdout) => {
        json({ installed: !err && stdout.includes('iarest-bridge') }); resolve()
      })
    })
  }

  // Archivos estáticos
  const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml'}
  let fp = url.pathname==='/' ? '/index.html' : url.pathname
  fp = path.join(publicDir, fp)
  try { const d = fs.readFileSync(fp); res.writeHead(200, {'Content-Type':MIME[path.extname(fp)]||'text/plain'}); res.end(d) }
  catch { res.writeHead(404); res.end('Not found') }
})

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  ia.rest Setup Wizard v2 · ${url}\n`)
  const p = process.platform
  if (p==='win32') exec(`start ${url}`)
  else if (p==='darwin') exec(`open ${url}`)
  else exec(`xdg-open ${url}`)
})

server.on('error', e => {
  if (e.code==='EADDRINUSE') {
    console.error(`\n  Ya hay una instancia abierta. Abre el navegador en http://localhost:${PORT}\n`)
    const p = process.platform
    if (p==='win32') exec(`start http://localhost:${PORT}`)
    else if (p==='darwin') exec(`open http://localhost:${PORT}`)
    process.exit(0)
  }
  console.error('Error:', e.message); process.exit(1)
})

} // fin startWizard
