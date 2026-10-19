import test from 'node:test'
import assert from 'node:assert/strict'
import { duracionPaso, leerRespuestaBandeja, leerRespuestaTraza, agruparPorIntento, paginacionBandeja, rotuloCodigo, rotuloPaso } from './tarificador-bandeja.ts'

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111', compania: 'allianz', ramo: 'comunidades', estado: 'requiere_humano',
  tipoError: 'captcha', motivo: 'Pide un código', fecha: '2026-10-08T10:00:00.000Z', intentos: 1, botVersion: '0.1.0',
  oportunidadId: null, puedeReintentar: true, puedeCancelar: true,
}

test('lee una bandeja válida y descarta filas rotas', () => {
  const r = leerRespuestaBandeja(200, { total: 2, hayMas: false, items: [ITEM, { id: 'x' }] })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.bandeja.items.length, 1)
    assert.equal(r.bandeja.total, 2)
  }
})

test('fail-closed: sin puedeReintentar/puedeCancelar explícitos no se ofrece ningún botón', () => {
  const { puedeReintentar: _a, puedeCancelar: _b, ...sinFlags } = ITEM
  const r = leerRespuestaBandeja(200, { total: 1, items: [sinFlags] })
  assert.equal(r.ok && r.bandeja.items[0].puedeReintentar, false)
  assert.equal(r.ok && r.bandeja.items[0].puedeCancelar, false)
})

test('errores de red, permiso y forma inesperada dan mensaje, nunca bandeja vacía fingida', () => {
  for (const [s, j] of [[502, null], [401, null], [503, { estado: 'sin_configurar' }], [200, { items: 'x' }], [500, {}]] as const) {
    const r = leerRespuestaBandeja(s, j)
    assert.equal(r.ok, false, String(s))
  }
})

test('traza: lectura defensiva y 404', () => {
  const r = leerRespuestaTraza(200, { botVersion: '0.1.0', pasos: [{ paso: 'login', inicio: '2026-10-08T10:00:00Z', duracionMs: 900, ok: false, errorCodigo: 'portal', capturaRef: null }, { paso: 5 }] })
  assert.equal(r.ok && r.traza.pasos.length, 1)
  assert.equal(leerRespuestaTraza(404, null).ok, false)
  assert.equal(leerRespuestaTraza(200, { pasos: [] }).ok, true)
})

test('traza: pasos agrupados por intento (sin intento = 1)', () => {
  const r = leerRespuestaTraza(200, { pasos: [
    { intento: 1, paso: 'login', inicio: 'a', duracionMs: 1, ok: false, errorCodigo: 'infra' },
    { intento: 2, paso: 'login', inicio: 'b', duracionMs: 1, ok: true },
    { paso: 'tarificar', inicio: 'c', duracionMs: 1, ok: true },
  ] })
  assert.ok(r.ok)
  if (!r.ok) return
  const g = agruparPorIntento(r.traza.pasos)
  assert.deepEqual(g.map((x) => [x.intento, x.pasos.length]), [[1, 2], [2, 1]])
})

test('rótulos y duraciones', () => {
  assert.equal(rotuloPaso('lectura_primas'), 'Leer las primas')
  assert.equal(rotuloPaso('raro'), 'raro')
  assert.equal(rotuloCodigo(null), '')
  assert.equal(duracionPaso(850), '0,9 s')
  assert.equal(duracionPaso(75_000), '1 min 15 s')
  assert.equal(duracionPaso(-1), '—')
})

test('paginación: tope 50', () => {
  assert.deepEqual(paginacionBandeja('51', null), { limite: 50, desde: 0 })
  assert.deepEqual(paginacionBandeja('10', '50'), { limite: 10, desde: 50 })
})

// ─── Elección de población (19/10/2026) ──────────────────────────────────────
import { cuerpoEleccionPoblacion, opcionesPoblacionDeItem } from './tarificador-bandeja.ts'

const OPS = [{ codigo: '00001- PUEBLO NUEVO', etiqueta: 'PUEBLO NUEVO' }, { codigo: '00001- VILLA ÁLAMO', etiqueta: 'VILLA ÁLAMO' }]

test('población: la lista estructurada del puerto llega al item; sin lista → null (no se inventa desde el mensaje)', () => {
  const r = leerRespuestaBandeja(200, { total: 2, items: [
    { ...ITEM, motivo: 'requiere_eleccion_poblacion: el código postal tiene 2 poblaciones; elige una en la bandeja y reintenta: PUEBLO NUEVO · VILLA ÁLAMO', opcionesPoblacion: OPS },
    { ...ITEM, id: '22222222-2222-4222-8222-222222222222', motivo: 'requiere_eleccion_poblacion: x' },
  ] })
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.bandeja.items[0].opcionesPoblacion, OPS)
    assert.equal(r.bandeja.items[1].opcionesPoblacion, null)
  }
})

test('población: opciones rotas o repetidas no se ofrecen; el código viaja EXACTO, nunca la etiqueta', () => {
  assert.equal(opcionesPoblacionDeItem({ opcionesPoblacion: [{ codigo: 5 }] }), null)
  assert.equal(opcionesPoblacionDeItem({ opcionesPoblacion: [] }), null)
  assert.equal(opcionesPoblacionDeItem({}), null)
  assert.deepEqual(opcionesPoblacionDeItem({ opcionesPoblacion: [...OPS, OPS[0]] }), OPS)
  assert.equal(cuerpoEleccionPoblacion(OPS, '1'), '00001- VILLA ÁLAMO')
  for (const mal of ['', '2', '-1', 'x', '0.5']) assert.equal(cuerpoEleccionPoblacion(OPS, mal), null, mal)
})

// ─── Elección de versión de vehículo (19/10/2026) ────────────────────────────
import { cuerpoEleccionVersion, filtrarOpcionesVersion, opcionesVersionDeItem } from './tarificador-bandeja.ts'

const VERS = [
  { etiqueta: 'GOLF 1.6 TDI 105CV', codigo: 'A1' },
  { etiqueta: 'Golf 2.0 TDI 150CV Sport', codigo: null },
  { etiqueta: 'POLO 1.0 TSI 95CV', codigo: 'B2' },
]

test('versión: la lista estructurada llega al item; sin lista o rota → null (no se inventa)', () => {
  const r = leerRespuestaBandeja(200, { total: 2, items: [
    { ...ITEM, opcionesVersion: VERS },
    { ...ITEM, id: '22222222-2222-4222-8222-222222222222' },
  ] })
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.bandeja.items[0].opcionesVersion, VERS)
    assert.equal(r.bandeja.items[1].opcionesVersion, null)
  }
  assert.equal(opcionesVersionDeItem({ opcionesVersion: [{ etiqueta: '' }] }), null)
  assert.equal(opcionesVersionDeItem({ opcionesVersion: [] }), null)
  assert.deepEqual(opcionesVersionDeItem({ opcionesVersion: [...VERS, VERS[0]] }), VERS)
})

test('versión: el cuerpo es {codigo, etiqueta} EXACTOS de la opción (codigo null si no hay); índice inválido → null', () => {
  assert.deepEqual(cuerpoEleccionVersion(VERS, '0'), { codigo: 'A1', etiqueta: 'GOLF 1.6 TDI 105CV' })
  assert.deepEqual(cuerpoEleccionVersion(VERS, '1'), { codigo: null, etiqueta: 'Golf 2.0 TDI 150CV Sport' })
  for (const mal of ['', '3', '-1', 'x', '0.5']) assert.equal(cuerpoEleccionVersion(VERS, mal), null, mal)
})

test('versión: el buscador filtra por todas las palabras, sin tildes ni mayúsculas, y conserva el índice original', () => {
  assert.deepEqual(filtrarOpcionesVersion(VERS, ''), [0, 1, 2])
  assert.deepEqual(filtrarOpcionesVersion(VERS, '  golf  tdi '), [0, 1])
  assert.deepEqual(filtrarOpcionesVersion(VERS, 'golf 150'), [1])
  assert.deepEqual(filtrarOpcionesVersion(VERS, 'polo'), [2])
  assert.deepEqual(filtrarOpcionesVersion(VERS, 'seat'), [])
})

// ─── «Reintentar» genérico oculto con elección de población/versión (19/10/2026) ───
test('BandejaAtencion: el botón «Reintentar» genérico no sale si el item pide elegir población o versión', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../app/(usuario)/correduria/tarificador/BandejaAtencion.tsx', import.meta.url), 'utf8')
  assert.match(src, /\{it\.puedeReintentar && !it\.opcionesPoblacion && !it\.opcionesVersion && \(\s*<button type="button" onClick=\{\(\) => void resolver\(it, 'reintentar'\)/)
})
