import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarDocSubido, interpretarSolicitud } from './solicitud-datos.ts'

test('muerta, completada y ok se distinguen; lo raro es error (no «muerta»)', () => {
  assert.deepEqual(interpretarSolicitud(200, { estado: 'muerta' }), { estado: 'muerta' })
  assert.deepEqual(interpretarSolicitud(200, { estado: 'completada' }), { estado: 'completada' })
  const ok = interpretarSolicitud(200, { estado: 'ok', ramo: 'moto', campos: [{ clave: 'matricula', etiqueta: 'Matrícula', tipo: 'texto', obligatorio: true }, 3] })
  assert.equal(ok.estado, 'ok')
  assert.equal(ok.estado === 'ok' ? ok.campos.length : 0, 1)
  assert.deepEqual(interpretarSolicitud(503, null), { estado: 'error' })
  assert.deepEqual(interpretarSolicitud(200, { estado: 'ok', ramo: 'barco', campos: [] }), { estado: 'error' })
})

test('la página del enlace no pide ni pinta nada de la ficha del cliente', () => {
  const page = readFileSync(new URL('../app/datos/[token]/page.tsx', import.meta.url), 'utf8')
  for (const prohibido of ['nombre', 'dni', 'direccion', 'telefono', 'email']) {
    assert.doesNotMatch(page, new RegExp(`\\.${prohibido}\\b`), `la página no lee .${prohibido}`)
  }
})

test('la subida de un documento: valores propuestos y fallos con motivo, nunca «ok» vacío', () => {
  const ok = interpretarDocSubido(200, { ok: true, etiqueta: 'Carné de conducir', valores: { fechaCarnet: '2015-03-15', tieneSeguro: true, raro: { x: 1 } }, aviso: null })
  assert.equal(ok.estado, 'ok')
  if (ok.estado === 'ok') {
    assert.equal(ok.valores.fechaCarnet, '2015-03-15')
    assert.equal(ok.valores.tieneSeguro, true)
    assert.equal('raro' in ok.valores, false)
  }
  assert.equal(interpretarDocSubido(200, { ok: false }).estado, 'fallo')
  const tope = interpretarDocSubido(409, { motivo: 'Como máximo 6 documentos por enlace.' })
  assert.equal(tope.estado === 'fallo' && tope.texto, 'Como máximo 6 documentos por enlace.')
  assert.equal(interpretarDocSubido(502, null).estado, 'fallo')
})

test('datos de un tercero: la página lo sabe (para pedir el consentimiento); sin la marca, no lo es', async () => {
  const { interpretarSolicitud } = await import('./solicitud-datos.ts')
  const campo = { clave: 'dni', etiqueta: 'DNI', tipo: 'texto', obligatorio: true }
  const t = interpretarSolicitud(200, { estado: 'ok', ramo: 'auto', campos: [campo], tercero: true })
  assert.equal(t.estado === 'ok' && t.tercero, true)
  const n = interpretarSolicitud(200, { estado: 'ok', ramo: 'auto', campos: [campo] })
  assert.equal(n.estado === 'ok' && n.tercero, false)
})

test('25/10/2026: el enlace vale para cualquier ramo de oportunidad (hogar incluido), no para uno inventado', () => {
  const campo = { clave: 'vivienda', etiqueta: 'Dirección de la vivienda', tipo: 'direccion', obligatorio: true }
  const h = interpretarSolicitud(200, { estado: 'ok', ramo: 'hogar', campos: [campo] })
  assert.equal(h.estado, 'ok')
  assert.equal(h.estado === 'ok' && h.ramo, 'hogar')
  assert.equal(interpretarSolicitud(200, { estado: 'ok', ramo: 'comunidades', campos: [campo] }).estado, 'ok')
  assert.equal(interpretarSolicitud(200, { estado: 'ok', ramo: 'barco', campos: [campo] }).estado, 'error')
})

test('las ayudas de dirección del enlace exigen un token VIVO (no son un servicio anónimo del Catastro)', async () => {
  const { readFileSync } = await import('node:fs')
  for (const r of ['../app/api/datos/codigo-postal/route.ts', '../app/api/datos/vias/route.ts']) {
    const src = readFileSync(new URL(r, import.meta.url), 'utf8')
    const guarda = src.indexOf('await tokenSolicitudVivo(')
    assert.ok(guarda > 0, r)
    assert.ok(guarda < src.search(/municipiosPorCp\(|buscarViasCallejero\(/), `${r}: la guarda va antes de consultar`)
    assert.match(src, /rateLimit\(`datos-/)
  }
  const { tokenSolicitudVivo } = await import('./solicitud-datos.ts')
  assert.equal(await tokenSolicitudVivo('corto'), false)
})

// ─── Fase B (26/10/2026): póliza actual, borrador y abandono ─────────────────

test('borrador del puente: solo claves del formulario (y subclaves de dirección), escalares o la lista de «No lo sé»', async () => {
  const { interpretarBorrador } = await import('./solicitud-datos.ts')
  const campos = [
    { clave: 'vivienda', etiqueta: 'Dirección', tipo: 'direccion', obligatorio: true },
    { clave: 'alarma', etiqueta: 'Alarma', tipo: 'si_no', obligatorio: true },
  ] as const
  const b = interpretarBorrador({ viviendaCp: '41003', alarma: true, _noLoSe: ['alarma', 3], intruso: 'x', raro: { a: 1 } }, campos as never)
  assert.deepEqual(b, { viviendaCp: '41003', alarma: true, _noLoSe: ['alarma'] })
  assert.equal(interpretarBorrador(null, campos as never), null)
  assert.equal(interpretarBorrador({ intruso: 'x' }, campos as never), null)
  const ok = interpretarSolicitud(200, { estado: 'ok', ramo: 'hogar', campos: [...campos], borrador: { alarma: false } })
  assert.deepEqual(ok.estado === 'ok' && ok.borrador, { alarma: false })
  const sin = interpretarSolicitud(200, { estado: 'ok', ramo: 'hogar', campos: [...campos] })
  assert.equal(sin.estado === 'ok' && sin.borrador, null)
})

test('subida de la póliza actual: se marca `dePoliza` solo si asegura lo dice', () => {
  const p = interpretarDocSubido(200, { ok: true, etiqueta: 'Póliza', valores: { companiaActual: 'Allianz', tramoContenido: '15000_30000' }, aviso: null, dePoliza: true })
  assert.equal(p.estado === 'ok' && p.dePoliza, true)
  const d = interpretarDocSubido(200, { ok: true, etiqueta: 'DNI', valores: {}, aviso: null })
  assert.equal(d.estado === 'ok' && d.dePoliza, false)
})

test('formulario: botón de póliza con `clase=poliza`, guardado con pausa al servidor (sin cookies), y un tercero solo con permiso', () => {
  const f = readFileSync(new URL('../app/datos/[token]/Formulario.tsx', import.meta.url), 'utf8')
  assert.match(f, /if \(clase === 'poliza'\) form\.set\('clase', 'poliza'\)/)
  assert.match(f, /void subir\(ficheros, 'poliza'\)/)
  assert.match(f, /fetch\('\/api\/datos\/borrador'/)
  assert.match(f, /if \(tercero && !consiente\) return/)
  assert.match(f, /setTimeout\([\s\S]*PAUSA_BORRADOR_MS\)/)
  assert.doesNotMatch(f, /document\.cookie|localStorage|sessionStorage/)
  const ruta = readFileSync(new URL('../app/api/datos/borrador/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /rateLimit\(`datos-borrador:/)
  assert.match(ruta, /RE_TOKEN|\[A-Za-z0-9_-\]\{40,60\}/)
  const doc = readFileSync(new URL('../app/api/datos/documento/route.ts', import.meta.url), 'utf8')
  assert.match(doc, /form\?\.get\('clase'\) === 'poliza' \? 'poliza' : 'documento'/)
})
