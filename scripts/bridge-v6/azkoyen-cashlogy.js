// ═══════════════════════════════════════════════════════════════
// ia.rest — Azkoyen Cashlogy Adapter v1.0
// Protocolo: TCP socket ASCII #cmd# → respuesta ASCII #code#...#
// Puerto por defecto: 8092 (CashlogyConnector)
// Encoding: latin1 (ISO-8859-1)
// ═══════════════════════════════════════════════════════════════

'use strict'
const net  = require('net')
const os   = require('os')
const fs   = require('fs')
const path = require('path')

// ── Colores terminal ─────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', B = '\x1b[36m', X = '\x1b[0m'

// ── Constantes ───────────────────────────────────────────────
const DEFAULT_PORT      = 8092
const TIMEOUT_INIT      = 3000    // 3s para #I# (handshake)
const TIMEOUT_STATUS    = 5000    // 5s para #T# (heartbeat)
const TIMEOUT_CHARGE    = 180000  // 3 min para cobro
const TIMEOUT_PAYOUT    = 30000   // 30s para devolución
const TIMEOUT_CLOSE     = 10000   // 10s para cierre
const HEARTBEAT_INTERVAL = 30000  // 30s entre heartbeats
const DISCOVERY_FAST    = [        // IPs a probar primero (nivel 1)
  '.1','.2','.10','.20','.50','.100','.101','.110','.120','.200','.201','.254'
]

// ── Parser de respuesta ──────────────────────────────────────
function parseResp(raw) {
  // "#0#2500#50#0#0#" → { code:'0', fields:['2500','50','0','0'], raw }
  if (!raw || !raw.startsWith('#')) return { code: 'ER:INVALID', fields: [], raw }
  const parts = raw.split('#').filter((_, i, a) => i > 0 && i < a.length - 1)
  return {
    code:   parts[0] ?? 'ER:INVALID',
    ok:     parts[0] === '0',
    fields: parts.slice(1),
    raw,
  }
}

// ── Enviar comando y recibir respuesta ───────────────────────
function sendCmd(ip, port, cmd, timeout) {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket()
    let buf = ''
    const timer = setTimeout(() => {
      sock.destroy()
      reject(new Error(`CASHLOGY_TIMEOUT after ${timeout}ms`))
    }, timeout)

    sock.on('data',  chunk => { buf += chunk.toString('latin1') })
    sock.on('close', () => { clearTimeout(timer); resolve(buf.trim()) })
    sock.on('error', err => { clearTimeout(timer); reject(err) })
    sock.connect(port, ip, () => sock.write(cmd, 'latin1'))
  })
}

// ── CashlogyAdapter ──────────────────────────────────────────
class CashlogyAdapter {
  constructor(ip, port = DEFAULT_PORT) {
    this.ip    = ip
    this.port  = port
    this.online = false
    this.version = null
    this._heartbeatTimer = null
    this._onStatusChange = null  // callback(status, info)
  }

  // Handshake inicial — verifica que hay una Cashlogy en esa IP
  async init() {
    try {
      const raw  = await sendCmd(this.ip, this.port, '#I#', TIMEOUT_INIT)
      const resp = parseResp(raw)
      if (resp.ok) {
        this.version = resp.fields[0] ?? 'unknown'
        this.online  = true
        console.log(`${G}[CASHLOGY]${X} Conectada en ${this.ip}:${this.port} v${this.version}`)
        return { ok: true, version: this.version }
      }
      return { ok: false, error: resp.code }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // Heartbeat silencioso — #T#1# no mueve dinero
  async status() {
    try {
      const raw  = await sendCmd(this.ip, this.port, '#T#1#', TIMEOUT_STATUS)
      const resp = parseResp(raw)
      if (resp.ok) {
        this.online = true
        return {
          ok:      true,
          version: resp.fields[0],
          status:  resp.fields[1],
          coins:   parseInt(resp.fields[2]) || 0,   // céntimos en monedas
          bills:   parseInt(resp.fields[3]) || 0,   // céntimos en billetes
          total:   (parseInt(resp.fields[2]) || 0) + (parseInt(resp.fields[3]) || 0),
        }
      }
      this.online = false
      return { ok: false, error: resp.code }
    } catch (e) {
      this.online = false
      return { ok: false, error: e.message }
    }
  }

  // Cobro — #C# bloquea hasta que el cliente termina de meter dinero
  async charge(amountCents, opNum = '00001', till = '1') {
    // Flags: onTop=1 (mostrar sobre cualquier app), showScreen=1,
    // partialAllow=1, insertIcon=1, changeIcon=1, payIcon=1, cancelIcon=1, acceptIcon=1
    const cmd = `#C#${opNum}#${till}#${amountCents}#1#1#1#1#1#1#1#1#`
    try {
      const raw  = await sendCmd(this.ip, this.port, cmd, TIMEOUT_CHARGE)
      const resp = parseResp(raw)
      const result = {
        ok:        resp.ok,
        code:      resp.code,
        auto:      parseInt(resp.fields[0]) || 0,   // cobrado automáticamente
        change:    parseInt(resp.fields[1]) || 0,   // cambio devuelto
        manual:    parseInt(resp.fields[2]) || 0,   // cobrar a mano
        extra:     parseInt(resp.fields[3]) || 0,   // pagó de más sin cambio
        cancelled: resp.code === 'WR:CANCEL',
        busy:      resp.code === 'ER:BUSY' || resp.code === 'ER:CLAIM',
        raw_cmd:   cmd,
        raw_resp:  raw,
      }
      // Determinar estado final
      if (result.cancelled)         result.estado = 'cancelado'
      else if (result.busy)         result.estado = 'busy'
      else if (!resp.ok)            result.estado = 'error'
      else if (result.manual > 0)   result.estado = 'parcial'
      else                          result.estado = 'completado'
      return result
    } catch (e) {
      return { ok: false, error: e.message, estado: 'error', raw_cmd: cmd }
    }
  }

  // Devolución / payout
  async payout(amountCents) {
    const cmd = `#P#${amountCents}#1#1#0#`
    try {
      const raw  = await sendCmd(this.ip, this.port, cmd, TIMEOUT_PAYOUT)
      const resp = parseResp(raw)
      return { ok: resp.ok, code: resp.code, dispensed: parseInt(resp.fields[0]) || 0 }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // Cierre de caja
  async closeTill() {
    try {
      const raw  = await sendCmd(this.ip, this.port, '#F#1#', TIMEOUT_CLOSE)
      const resp = parseResp(raw)
      return {
        ok:     resp.ok,
        total:  parseInt(resp.fields[0]) || 0,
        coins:  parseInt(resp.fields[1]) || 0,
        bills:  parseInt(resp.fields[2]) || 0,
        manual: parseInt(resp.fields[3]) || 0,
      }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // Reset (cancela operación en curso)
  async reset() {
    try {
      const raw  = await sendCmd(this.ip, this.port, '#Z#', TIMEOUT_STATUS)
      const resp = parseResp(raw)
      return { ok: resp.ok }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }

  // Iniciar heartbeat periódico
  startHeartbeat(onStatusChange) {
    this._onStatusChange = onStatusChange
    this.stopHeartbeat()
    this._heartbeatTimer = setInterval(async () => {
      const wasOnline = this.online
      const st = await this.status()
      if (wasOnline !== this.online && onStatusChange) {
        onStatusChange(this.online ? 'online' : 'offline', st)
      }
    }, HEARTBEAT_INTERVAL)
    console.log(`${B}[CASHLOGY]${X} Heartbeat cada ${HEARTBEAT_INTERVAL/1000}s`)
  }

  stopHeartbeat() {
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer)
    this._heartbeatTimer = null
  }
}

// ── Discovery ────────────────────────────────────────────────
async function discover(port = DEFAULT_PORT, onProgress) {
  // Obtener rango de red local
  const ifaces = os.networkInterfaces()
  const ranges  = []
  for (const list of Object.values(ifaces)) {
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const base = iface.address.split('.').slice(0, 3).join('.')
        ranges.push(base)
      }
    }
  }

  if (!ranges.length) {
    console.warn(`${Y}[CASHLOGY DISC]${X} No se detectaron interfaces de red`)
    return null
  }

  const base = ranges[0]
  console.log(`${B}[CASHLOGY DISC]${X} Escaneando ${base}.x:${port}`)
  if (onProgress) onProgress({ phase: 'start', base, port })

  // Nivel 1 — IPs comunes (~100ms)
  console.log(`${B}[CASHLOGY DISC]${X} Nivel 1: IPs frecuentes...`)
  for (const suffix of DISCOVERY_FAST) {
    const ip = `${base}${suffix}`
    const found = await probeIP(ip, port)
    if (found) {
      console.log(`${G}[CASHLOGY DISC]${X} ¡Encontrada en ${ip}! (nivel 1)`)
      if (onProgress) onProgress({ phase: 'found', ip, level: 1 })
      return ip
    }
  }

  // Nivel 2 — Barrido completo /24 (~20s)
  console.log(`${B}[CASHLOGY DISC]${X} Nivel 2: barrido completo...`)
  if (onProgress) onProgress({ phase: 'sweep', base })
  const batch = 20 // 20 en paralelo para no saturar la LAN
  for (let i = 1; i <= 254; i += batch) {
    const probes = []
    for (let j = i; j < i + batch && j <= 254; j++) {
      const ip = `${base}.${j}`
      if (!DISCOVERY_FAST.some(s => ip.endsWith(s))) probes.push(probeIP(ip, port))
    }
    const results = await Promise.all(probes)
    const ips = [`${base}.${i}`, `${base}.${i+1}`] // approx
    for (let k = 0; k < results.length; k++) {
      if (results[k]) {
        const ip = `${base}.${i + k}`
        console.log(`${G}[CASHLOGY DISC]${X} ¡Encontrada en ${ip}! (nivel 2)`)
        if (onProgress) onProgress({ phase: 'found', ip, level: 2 })
        return ip
      }
    }
  }

  console.log(`${Y}[CASHLOGY DISC]${X} No se encontró ninguna Cashlogy en ${base}.x:${port}`)
  if (onProgress) onProgress({ phase: 'not_found' })
  return null
}

// Prueba una IP específica — conexión rápida + handshake #I#
function probeIP(ip, port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    const timer = setTimeout(() => { sock.destroy(); resolve(false) }, 1500)
    let buf = ''
    sock.on('data', chunk => { buf += chunk.toString('latin1') })
    sock.on('close', () => {
      clearTimeout(timer)
      resolve(buf.startsWith('#0#')) // Cashlogy responde #0#version#
    })
    sock.on('error', () => { clearTimeout(timer); resolve(false) })
    sock.connect(port, ip, () => sock.write('#I#', 'latin1'))
  })
}

// ── CashlogyManager — gestiona todo el ciclo de vida ─────────
class CashlogyManager {
  constructor({ configFile, port = DEFAULT_PORT } = {}) {
    this.configFile = configFile || path.join(os.homedir(), '.iarest', 'cashlogy.json')
    this.port       = port
    this.adapter    = null
    this.ip         = null
    this.status     = 'desconocido'
    this._queue     = Promise.resolve() // cola serializada — un cmd a la vez
  }

  loadSavedIP() {
    try {
      if (fs.existsSync(this.configFile)) {
        const d = JSON.parse(fs.readFileSync(this.configFile, 'utf8'))
        return d.cashlogy_ip || null
      }
    } catch {}
    return null
  }

  saveIP(ip) {
    try {
      const dir = path.dirname(this.configFile)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const existing = fs.existsSync(this.configFile)
        ? JSON.parse(fs.readFileSync(this.configFile, 'utf8'))
        : {}
      fs.writeFileSync(this.configFile, JSON.stringify({ ...existing, cashlogy_ip: ip, cashlogy_port: this.port }, null, 2))
    } catch {}
  }

  async init(onStatusChange) {
    this._onStatusChange = onStatusChange
    const savedIP = this.loadSavedIP()

    if (savedIP) {
      console.log(`${B}[CASHLOGY]${X} Probando IP guardada: ${savedIP}`)
      const adapter = new CashlogyAdapter(savedIP, this.port)
      const r = await adapter.init()
      if (r.ok) {
        this.ip      = savedIP
        this.adapter = adapter
        this.status  = 'online'
        this.adapter.startHeartbeat((s, info) => this._handleStatusChange(s, info))
        if (onStatusChange) onStatusChange('online', { ip: savedIP, version: r.version })
        return true
      }
      console.log(`${Y}[CASHLOGY]${X} IP guardada no responde — redescubriendo`)
    }

    return this.discover(onStatusChange)
  }

  async discover(onStatusChange) {
    this.status = 'descubriendo'
    if (onStatusChange) onStatusChange('descubriendo', {})

    const ip = await discover(this.port, prog => {
      if (onStatusChange) onStatusChange('descubriendo', prog)
    })

    if (!ip) {
      this.status = 'offline'
      if (onStatusChange) onStatusChange('offline', { reason: 'not_found' })
      return false
    }

    const adapter = new CashlogyAdapter(ip, this.port)
    const r = await adapter.init()
    if (r.ok) {
      this.ip      = ip
      this.adapter = adapter
      this.status  = 'online'
      this.saveIP(ip)
      this.adapter.startHeartbeat((s, info) => this._handleStatusChange(s, info))
      if (onStatusChange) onStatusChange('online', { ip, version: r.version })
      return true
    }

    this.status = 'offline'
    if (onStatusChange) onStatusChange('offline', { reason: 'init_failed' })
    return false
  }

  _handleStatusChange(status, info) {
    this.status = status
    if (this._onStatusChange) this._onStatusChange(status, { ...info, ip: this.ip })
    if (status === 'offline') {
      console.log(`${Y}[CASHLOGY]${X} Desconectada — reintentando...`)
      setTimeout(() => this.discover(this._onStatusChange), 10000)
    }
  }

  // Encola comandos — nunca dos en paralelo
  _enqueue(fn) {
    this._queue = this._queue.then(fn, fn)
    return this._queue
  }

  charge(amountCents, opNum) {
    if (this.status !== 'online')
      return Promise.resolve({ ok: false, error: 'Cashlogy offline', estado: 'error' })
    return this._enqueue(() => this.adapter.charge(amountCents, opNum))
  }

  payout(amountCents) {
    if (this.status !== 'online')
      return Promise.resolve({ ok: false, error: 'Cashlogy offline' })
    return this._enqueue(() => this.adapter.payout(amountCents))
  }

  closeTill() {
    return this._enqueue(() => this.adapter?.closeTill() ?? Promise.resolve({ ok: false }))
  }

  getStatus() {
    return this.adapter?.status() ?? Promise.resolve({ ok: false, error: 'No conectada' })
  }

  isOnline() { return this.status === 'online' }
}

module.exports = { CashlogyAdapter, CashlogyManager, discover, parseResp, DEFAULT_PORT }
