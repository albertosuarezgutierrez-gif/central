import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decidirBotonClp } from './lead-correduria-peticion.ts'
import {
  botonTope, botonesTarificar, decidirOferta, estadoPendienteTras, leerRevision, leerTarificar, lineaTrasTarificar, textoBotonVivo, textoTarificar,
} from './lead-correduria-tarificar.ts'

const CHAT = '12345'
const OP = '22222222-2222-4222-8222-222222222222'

const revisionOk = (companias: unknown[], extra: Record<string, unknown> = {}) => leerRevision(200, {
  estado: 'ok', rpaActivo: true, contador: { usadas: 7, tope: 20, extra: 0 },
  oportunidades: [{ id: OP, ramo: 'auto', estado: 'evaluada', companias, supuestos: [{ campo: 'conductor', texto: 'conductor habitual: el propio cliente (no ha dicho otro)' }], noLeidos: [] }],
  ...extra,
})

test('🪤 🤖 y ➕: solo la PERSONA autorizada; ➕ lleva un día real, sin datos personales', () => {
  assert.deepEqual(decidirBotonClp({ from: { id: 12345 } }, 'tar', ['9'], CHAT), { ok: true, accion: 'tar', id: 9, quien: '12345' })
  assert.equal(decidirBotonClp({ from: { id: 999 } }, 'tar', ['9'], CHAT).ok, false, 'otra persona no lanza bots')
  assert.equal(decidirBotonClp({ from: { id: 999 } }, 'top', ['20261019'], CHAT).ok, false, 'otra persona no amplía el tope')
  assert.deepEqual(decidirBotonClp({ from: { id: 12345 } }, 'top', ['20261019'], CHAT), { ok: true, accion: 'top', dia: '2026-10-19', quien: '12345' })
  assert.equal(decidirBotonClp({ from: { id: 12345 } }, 'top', ['2026-10-19'], CHAT).ok, false)
  for (const fila of [...botonesTarificar(123456789012345), ...botonTope('2026-10-19')]) for (const b of fila) assert.ok(Buffer.byteLength(b.callback ?? "") <= 64)
  assert.equal(botonTope('2026-10-19')[0][0].callback, 'clp_top:20261019')
  assert.equal(botonesTarificar(5)[0][0].callback, 'clp_tar:5')
  assert.ok(!/0,50/.test(JSON.stringify(botonesTarificar(5))), 'el botón de los bots no habla de 0,50€')
})

test('🪤 con ≥1 compañía lista se ofrece 🤖; si les falta un dato del cliente, repregunta; sin bot, solo aviso', () => {
  const lista = revisionOk([{ compania: 'mapfre', estado: 'lista' }, { compania: 'allianz', estado: 'faltan', preguntar: ['aseguradoAntes'], noLeidas: [], otros: [] }])
  assert.equal(lista.estado, 'ok')
  if (lista.estado !== 'ok') return
  assert.deepEqual(decidirOferta(lista), { tipo: 'boton' })
  const faltan = revisionOk([{ compania: 'mapfre', estado: 'faltan', preguntar: ['fechaCarnet'], noLeidas: [], otros: [] }])
  if (faltan.estado === 'ok') assert.deepEqual(decidirOferta(faltan), { tipo: 'repregunta', preguntar: ['fechaCarnet'], concretas: [] })
  const sinBot = leerRevision(200, { estado: 'ok', rpaActivo: true, contador: null, oportunidades: [{ id: OP, ramo: 'hogar', estado: 'sin_bot', companias: [] }] })
  if (sinBot.estado === 'ok') {
    assert.deepEqual(decidirOferta(sinBot), { tipo: 'aviso' })
    const t = textoTarificar({ id: null, pila: 'Ana', revision: sinBot })
    assert.match(t, /Sin bot para hogar/)
    assert.ok(!/€/.test(t), 'sin bot no se ofrece pagar Avant2 por defecto')
    assert.match(t, /no he podido contar/)
  }
  // Lo desconocido NO es «todo listo».
  assert.equal(leerRevision(502, { estado: 'error' }).estado, 'error')
  assert.equal(leerRevision(200, { estado: 'ok' }).estado, 'error')
})

test('🪤 el aviso §3.3: qué compañías se lanzarían, supuestos a la vista, «Hoy: N/20» y nada de €', () => {
  const r = revisionOk([{ compania: 'mapfre', estado: 'lista' }, { compania: 'allianz', estado: 'lista' }, { compania: 'generali', estado: 'sin_declaracion' }])
  if (r.estado !== 'ok') return assert.fail('revisión')
  const t = textoTarificar({ id: 12, pila: 'Ana <b>', revision: r })
  assert.match(t, /Se lanzarían \(coche, gratis en su portal\): <b>Mapfre y Allianz<\/b>/)
  assert.match(t, /Generali: su bot no declara/)
  assert.match(t, /Supuestos: conductor habitual: el propio cliente/)
  assert.match(t, /Hoy: 7\/20 tarificaciones con bots/)
  assert.ok(!/€/.test(t))
  assert.ok(!t.includes('Ana <b>'), 'el nombre va escapado')
  const apagado = revisionOk([{ compania: 'mapfre', estado: 'lista' }], { rpaActivo: false })
  if (apagado.estado === 'ok') assert.match(textoTarificar({ id: 1, pila: null, revision: apagado }), /bots están APAGADOS/)
})

test('🪤 tras 🤖: apagado / sin tabla no fingen (el botón sigue vivo); tope → cola; lo raro es «incierto», nunca se reintenta', () => {
  assert.equal(estadoPendienteTras(leerTarificar(503, { estado: 'apagado' })), 'pendiente')
  assert.match(lineaTrasTarificar(leerTarificar(503, { estado: 'apagado' })), /apagados/)
  assert.equal(estadoPendienteTras(leerTarificar(503, { estado: 'sin_tabla' })), 'pendiente')
  assert.match(lineaTrasTarificar(leerTarificar(503, { estado: 'sin_tabla' })), /no tarifico sin poder contar/)
  const tope = leerTarificar(409, { estado: 'tope', usadas: 20, tope: 20, pendientes: 2, dia: '2026-10-19' })
  assert.equal(tope.estado, 'tope')
  assert.equal(estadoPendienteTras(tope), 'cola')
  assert.match(lineaTrasTarificar(tope), /queda en cola/)
  for (const [s, j] of [[502, { estado: 'error', motivo: 'red' }], [500, null], [200, { estado: 'raro' }], [409, { estado: 'tope' }]] as const) {
    assert.equal(estadoPendienteTras(leerTarificar(s, j)), 'incierto', `${s}`)
  }
  const ok = leerTarificar(200, { estado: 'encolado', usadas: 9, tope: 20, trabajos: [
    { compania: 'mapfre', estado: 'encolado' }, { compania: 'allianz', estado: 'duplicado' }, { compania: 'generali', estado: 'rechazado', motivo: 'bot_pausado' },
  ] })
  assert.equal(estadoPendienteTras(ok), 'enviado')
  const l = lineaTrasTarificar(ok)
  assert.match(l, /Bots en marcha<\/b>: Mapfre/)
  assert.match(l, /no se repiten\): Allianz/)
  assert.match(l, /Generali \(bot_pausado\)/)
  assert.match(l, /Hoy: 9\/20/)
  assert.equal(estadoPendienteTras(leerTarificar(200, { estado: 'encolado', trabajos: [{ compania: 'mapfre', estado: 'rechazado' }] })), 'fallido')
})

test('🪤 el 🤖 es de un solo uso, solo sobre pendientes de tarificar, y ✅ jamás envía un pendiente de tarificar (lee el fuente)', () => {
  const src = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(src, /SET estado = 'enviando'[^`]*WHERE id = \$\{id\} AND tipo = 'tarificar' AND estado = 'pendiente' AND caduca_at > now\(\)/)
  // ➕: una marca única por mensaje pulsado.
  assert.match(src, /gmail_message_id[^`]*`tope:\$\{dia\}:\$\{mensajeId\}`[^`]*ON CONFLICT \(gmail_message_id, tipo\) DO NOTHING/)
  // Los bots, nunca Avant2/Codeoscopic (0,50€) desde aquí.
  const codigo = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!/codeoscopic|cotizar|retarificar|auto-nuevo|cas_tarif/i.test(codigo))
  const pend = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(pend, /SET estado = 'enviando'[^`]*WHERE id = \$\{d\.id\} AND tipo NOT IN \('tarificar', 'discrepancia'\) AND estado = 'pendiente'/)
})

test('🪤 lo que queda EN COLA por el tope no se queda sin botón (cola, nunca descarte); lo cerrado no lo recupera', () => {
  const tope = leerTarificar(409, { estado: 'tope', usadas: 20, tope: 20, pendientes: 2, dia: '2026-10-19' })
  assert.match(textoBotonVivo(tope, 7) ?? '', /En cola[^\n]*#clp7[^\n]*No se ha lanzado nada/)
  assert.match(textoBotonVivo(leerTarificar(503, { estado: 'apagado' }), 7) ?? '', /Sigue pendiente[^\n]*#clp7/)
  assert.equal(textoBotonVivo(leerTarificar(502, { estado: 'red' }), 7), null) // incierto: nada que pulsar
  assert.equal(textoBotonVivo(leerTarificar(200, { estado: 'encolado', trabajos: [{ compania: 'mapfre', estado: 'encolado' }] }), 7), null)
  const src = readFileSync(new URL('./lead-correduria-tarificar-proceso.ts', import.meta.url), 'utf8').replace(/\s+/g, ' ')
  assert.match(src, /const vivo = r \? textoBotonVivo\(r, id\) : null if \(vivo\) await tgSendButtons\(vivo, botonesTarificar\(id\)\)/)
})

test('🪤 F3b: los bots «en pruebas» se listan y NO dan botón; las preguntas concretas viajan a la repregunta; una discrepancia frena', () => {
  const soloPruebas = revisionOk([{ compania: 'generali', estado: 'en_pruebas' }, { compania: 'allianz', estado: 'en_pruebas' }])
  assert.equal(soloPruebas.estado, 'ok')
  if (soloPruebas.estado !== 'ok') return
  assert.deepEqual(decidirOferta(soloPruebas), { tipo: 'aviso' })
  const t = textoTarificar({ id: null, pila: 'Ana', revision: soloPruebas })
  assert.match(t, /En pruebas[^\n]*Generali y Allianz/)
  assert.doesNotMatch(t, /Se lanzarían/)
  const conDudas = leerRevision(200, {
    estado: 'ok', rpaActivo: true, contador: null,
    oportunidades: [{ id: OP, ramo: 'auto', estado: 'evaluada', companias: [{ compania: 'mapfre', estado: 'faltan', preguntar: ['aseguradoAntes'], noLeidas: [], otros: [] }], supuestos: [], noLeidos: [], concretas: ['seguro_anterior_siniestros', 'inventado'] }],
  })
  if (conDudas.estado === 'ok') assert.deepEqual(decidirOferta(conDudas), { tipo: 'repregunta', preguntar: ['aseguradoAntes'], concretas: ['seguro_anterior_siniestros'] })
  const dis = leerRevision(200, {
    estado: 'ok', rpaActivo: true, contador: null,
    oportunidades: [{ id: OP, ramo: 'auto', estado: 'discrepancias', companias: [], pendientes: ['fechaNacimiento'] }, { id: OP, ramo: 'moto', estado: 'evaluada', companias: [{ compania: 'mapfre', estado: 'lista' }] }],
  })
  if (dis.estado === 'ok') {
    assert.deepEqual(decidirOferta(dis), { tipo: 'aviso' })
    assert.match(textoTarificar({ id: null, pila: null, revision: dis }), /no cuadran[^\n]*fecha de nacimiento/)
  }
})

test('🪤 F3b: una pulsación que solo trae duplicados dice «ya en marcha» (y no reabre el botón)', () => {
  const r = leerTarificar(200, { estado: 'encolado', trabajos: [{ compania: 'mapfre', estado: 'duplicado' }], usadas: null, tope: null })
  assert.match(lineaTrasTarificar(r), /Ya estaban en marcha[^\n]*Mapfre/)
  assert.doesNotMatch(lineaTrasTarificar(r), /Bots en marcha|Tope/)
  assert.equal(estadoPendienteTras(r), 'enviado')
  assert.equal(textoBotonVivo(r, 3), null)
})
