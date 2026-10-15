import test from 'node:test'
import assert from 'node:assert/strict'
import {
  esEstadoFinal, leerEncolado, leerIntegraciones, leerTrabajo, resumenTrabajo, rotuloEstado, textoOferta, textoPrima, rotuloIntegracion,
} from './tarificador-probar.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const OFERTA = { compania: 'allianz', producto: 'Moto', primaTotalAnual: 2162.49, primaNeta: 2000, impuestos: 162.49, primaTotalSucesivos: null, pdfIndice: 0 }

test('integraciones: lista vacía es «revisado», una respuesta rota o un fallo NO es vacío', () => {
  const vacia = leerIntegraciones(200, { integraciones: [] })
  assert.deepEqual(vacia, { ok: true, integraciones: [] })
  for (const [s, j] of [[200, {}], [200, null], [502, null], [503, { estado: 'sin_configurar' }], [401, null]] as const) {
    const r = leerIntegraciones(s, j)
    assert.equal(r.ok, false, String(s))
    if (!r.ok) assert.ok(r.mensaje.length > 0)
  }
  const dup = leerIntegraciones(200, { integraciones: [{ compania: 'allianz', ramo: 'moto' }, { compania: 'allianz', ramo: 'moto' }, { compania: 'x' }] })
  assert.ok(dup.ok && dup.integraciones.length === 1 && dup.integraciones[0].clave === 'allianz/moto')
  assert.equal(rotuloIntegracion({ compania: 'allianz', ramo: 'moto' }), 'Allianz · moto')
})

test('encolado: 202 con trabajoId; duplicado muestra el existente; rechazos con texto para personas', () => {
  assert.deepEqual(leerEncolado(202, { estado: 'encolado', trabajoId: ID }), { ok: true, trabajoId: ID, duplicado: false })
  assert.deepEqual(leerEncolado(200, { duplicado: true, trabajoId: ID }), { ok: true, trabajoId: ID, duplicado: true })
  assert.deepEqual(leerEncolado(409, { duplicado: true, id: ID }), { ok: true, trabajoId: ID, duplicado: true })
  const sin = leerEncolado(409, { estado: 'rechazado', motivo: 'sin_riesgo_previo' })
  assert.ok(!sin.ok && /oportunidad/.test(sin.mensaje))
  const modo = leerEncolado(409, { motivo: 'modo_no_automatizable: inactiva' })
  assert.ok(!modo.ok && /habilitados/.test(modo.mensaje))
  assert.equal(leerEncolado(202, { estado: 'encolado' }).ok, false) // sin id no hay nada que sondear
  assert.equal(leerEncolado(202, { trabajoId: 'no-uuid' }).ok, false)
  const purgado = leerEncolado(409, { estado: 'rechazado', motivo: 'origen_purgado' })
  assert.ok(!purgado.ok && /se borraron sus datos personales/.test(purgado.mensaje) && /Nueva oportunidad/.test(purgado.mensaje))
  const desconocido = leerEncolado(409, { motivo: 'algo_nuevo', mensaje: 'Texto claro de asegura' })
  assert.deepEqual(desconocido, { ok: false, mensaje: 'Texto claro de asegura' })
  const sinTexto = leerEncolado(409, { motivo: 'algo_nuevo', mensaje: 42 })
  assert.ok(!sinTexto.ok && /HTTP 409/.test(sinTexto.mensaje))
  const apagado = leerEncolado(503, { estado: 'apagado' })
  assert.ok(!apagado.ok && /apagado/.test(apagado.mensaje))
})

test('trabajo: lectura defensiva; sin estado o con fallo de red es «no se pudo comprobar»', () => {
  assert.equal(leerTrabajo(200, {}).ok, false)
  assert.equal(leerTrabajo(502, null).ok, false)
  assert.equal(leerTrabajo(404, { estado: 'no_encontrado' }).ok, false)
  const l = leerTrabajo(200, { estado: 'ok', error: null, motivo: null, opcionesVersion: null, ofertas: [OFERTA, { producto: 'sin prima' }], pdfs: [] })
  assert.ok(l.ok)
  if (l.ok) assert.equal(l.trabajo.ofertas.length, 1) // una oferta sin prima no es una oferta
})

test('estados: en marcha vs finales; estado desconocido se enseña tal cual y no es final', () => {
  for (const e of ['ok', 'error_definitivo', 'requiere_humano', 'cancelado']) assert.equal(esEstadoFinal(e), true, e)
  for (const e of ['pendiente', 'en_curso', 'error_reintentable', 'raro']) assert.equal(esEstadoFinal(e), false, e)
  assert.equal(rotuloEstado('raro'), 'Estado: raro')
})

test('primas: formato español y «—» para lo que no consta (nunca 0,00€)', () => {
  assert.equal(textoPrima(2162.49), '2.162,49€')
  assert.equal(textoPrima(null), '—')
  assert.equal(textoOferta({ compania: 'allianz', producto: 'Moto', primaAnual: 2162.49, primaNeta: 2000, impuestos: 162.49, primaSucesivos: null, pdfIndice: 0, supuestos: null }),
    'Allianz · Moto — 2.162,49€/año (neta 2.000,00€ · impuestos 162,49€)')
  assert.equal(textoOferta({ compania: '', producto: '', primaAnual: 10, primaNeta: null, impuestos: null, primaSucesivos: null, pdfIndice: null, supuestos: null }), 'Oferta — 10,00€/año')
})

test('resumen: ok con ofertas, ok SIN ofertas (aviso), parada con motivo y elección de versión', () => {
  const ok = resumenTrabajo({ estado: 'ok', error: null, motivo: null, opcionesVersion: null, ofertas: [{ ...OFERTA, primaAnual: 312.4, primaNeta: null, impuestos: null, primaSucesivos: null, pdfIndice: null, supuestos: null, compania: 'allianz' }] })
  assert.equal(ok.titulo, 'Tarificado'); assert.equal(ok.tono, 'ok'); assert.equal(ok.final, true); assert.equal(ok.motivo, null)
  assert.deepEqual(ok.ofertas, ['Allianz · Moto — 312,40€/año'])

  const vacio = resumenTrabajo({ estado: 'ok', error: null, motivo: null, opcionesVersion: null, ofertas: [] })
  assert.equal(vacio.titulo, 'Terminó sin ofertas'); assert.equal(vacio.tono, 'aviso'); assert.match(vacio.motivo ?? '', /ninguna oferta/)

  const versiones = [{ codigo: 'A1', etiqueta: 'Versión A' }, { codigo: 'B2', etiqueta: 'Versión B' }]
  const parado = resumenTrabajo({ estado: 'requiere_humano', error: { tipo: 'datos', mensaje: 'x' }, motivo: 'Hay que elegir la versión del vehículo: A, B', opcionesVersion: versiones, ofertas: [] })
  assert.equal(parado.final, true); assert.equal(parado.tono, 'aviso'); assert.equal(parado.pideVersion, true)
  assert.match(parado.motivo ?? '', /elegir la versión/)

  const sinLista = resumenTrabajo({ estado: 'requiere_humano', error: null, motivo: 'Captcha', opcionesVersion: null, ofertas: [] })
  assert.equal(sinLista.pideVersion, false)

  const curso = resumenTrabajo({ estado: 'en_curso', error: null, motivo: null, opcionesVersion: null, ofertas: [] })
  assert.equal(curso.final, false); assert.equal(curso.tono, 'curso')
})

test('supuestos del bot (15/10/2026): se leen de cada oferta y el resumen los da una vez, junto al precio', () => {
  const SUP = 'Precio con supuestos: uso diario, garaje colectivo, sin 2º conductor.'
  const l = leerTrabajo(200, { estado: 'ok', ofertas: [{ ...OFERTA, supuestos: SUP }, { ...OFERTA, producto: 'Turismos · Otra', supuestos: SUP }, { ...OFERTA, supuestos: 7 }] })
  assert.ok(l.ok)
  if (!l.ok) return
  assert.deepEqual(l.trabajo.ofertas.map((o) => o.supuestos), [SUP, SUP, null])
  const r = resumenTrabajo(l.trabajo)
  assert.deepEqual(r.supuestos, [SUP], 'sin repetir')
  // Una versión de asegura que aún no lo manda: nada que enseñar (no se inventa «sin supuestos»).
  const viejo = leerTrabajo(200, { estado: 'ok', ofertas: [OFERTA] })
  assert.ok(viejo.ok && resumenTrabajo(viejo.trabajo).supuestos.length === 0)
})

test('PrecioBots enseña los supuestos JUNTO al precio (cepo de fuente)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(src, /res\.supuestos\.map\(/)
})

test('mensajeDeFallo 502: «no respondió a tiempo» (timeout) vs «no se pudo conectar» (red o sin motivo)', async () => {
  const { mensajeDeFallo } = await import('./tarificador-probar.ts')
  assert.match(mensajeDeFallo(502, { estado: 'error', motivo: 'timeout' }), /asegura no respondió a tiempo/)
  assert.match(mensajeDeFallo(502, { estado: 'error', motivo: 'red' }), /no se pudo conectar con asegura/)
  assert.match(mensajeDeFallo(502, null), /no se pudo conectar con asegura/)
})

test('versiones SIN código (Mapfre, 15/10/2026): se leen y piden versión; una opción sin etiqueta o con código basura se descarta', () => {
  const l = leerTrabajo(200, {
    estado: 'requiere_humano', error: { tipo: 'eleccion', mensaje: 'x' }, motivo: 'Hay que elegir la versión del vehículo',
    opcionesVersion: [{ codigo: null, etiqueta: 'Marca Prueba 2.9 Gl · 163 CV' }, { etiqueta: 'Marca Prueba 2.9 Gls · 163 CV' }, { codigo: null }, { codigo: 7, etiqueta: 'rara' }],
    ofertas: [], pdfs: [],
  })
  assert.ok(l.ok)
  if (!l.ok) return
  assert.deepEqual(l.trabajo.opcionesVersion, [{ codigo: null, etiqueta: 'Marca Prueba 2.9 Gl · 163 CV' }, { codigo: null, etiqueta: 'Marca Prueba 2.9 Gls · 163 CV' }])
  assert.equal(resumenTrabajo(l.trabajo).pideVersion, true)
})
