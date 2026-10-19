import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MEDIADOR, llevaInformacionPrevia } from '@central/module-seguros'
import { decidirBotonClp } from './lead-correduria-peticion.ts'
import { hiloConPrecio, leerGuardar } from './lead-correduria-respuesta.ts'
import {
  borradorPropuesta, botonesElegir, botonesPropuesta, claveRepreguntaIdd, conOpcion, datosDePropuesta, interpretarEnvioPropuesta, leerDatosPropuesta,
  leerPropuesta, numerar, plantillaRepreguntaIdd, textoPropuestaTelegram, type PropuestaLeida,
} from './lead-correduria-propuesta.ts'

const OF1 = '11111111-1111-4111-8111-111111111111'
const OF2 = '22222222-2222-4222-8222-222222222222'
const OF3 = '33333333-3333-4333-8333-333333333333'
const CONTACTO = { to: 'juan@example.com', asunto: 'Seguro coche', messageId: '<m2@ex.com>' }

const crudo = (extra: Record<string, unknown> = {}) => ({
  hiloId: '7', clienteId: '44444444-4444-4444-8444-444444444444', oportunidadId: '55555555-5555-4555-8555-555555555555', ramo: 'auto', pila: 'Juan',
  estadoDatos: 'tarificada', messageIdRaiz: '<m1@ex.com>', messageIds: ['<m1@ex.com>', '<m2@ex.com>'],
  necesidades: {
    completas: true, total: 2,
    respondidas: [
      { id: 'modalidad', etiqueta: 'Modalidad', texto: 'todo riesgo con franquicia', fuente: 'respuesta', de: null },
      { id: 'prioridad', etiqueta: 'Prioridad', texto: 'el precio', fuente: 'respuesta', de: null },
    ],
    faltan: [],
  },
  opciones: [
    { clave: OF2, origen: 'rpa', compania: 'Mapfre', producto: null, primaEur: 398, franquiciaEur: 0, firmeza: 'estimado', coberturas: ['Daños propios (todo riesgo)', 'Lunas'], bloqueo: null, caducada: false, enviable: true, motivoNoEnviable: null },
    { clave: OF1, origen: 'rpa', compania: 'Allianz', producto: null, primaEur: 412.3, franquiciaEur: 300, firmeza: 'estimado', coberturas: ['Daños propios (todo riesgo)'], bloqueo: 'INCENDIO-ROBO SIN DAÑOS', caducada: false, enviable: false, motivoNoEnviable: 'no encaja: la compañía la dejará bloqueada' },
    { clave: `cds:${OF3}`, origen: 'avant2', compania: 'Reale', producto: null, primaEur: 350, franquiciaEur: null, firmeza: 'estimado', coberturas: [], bloqueo: null, caducada: false, enviable: true, motivoNoEnviable: 'precio de Avant2: se envía desde su ficha' },
  ],
  recomendada: { clave: OF2, justificacion: 'necesidad: le importa sobre todo el precio — la más barata' },
  huella: 'abc12345',
  ...extra,
})

const P = leerPropuesta(crudo())!
const D = datosDePropuesta(P, CONTACTO, [])

test('leerPropuesta: un precio de Avant2 NUNCA es enviable aunque asegura diga que sí (fail-closed)', () => {
  assert.equal(P.opciones.find((o) => o.origen === 'avant2')!.enviable, false)
  assert.equal(leerPropuesta({ ...crudo(), hiloId: 'x' }), null)
  // «Completas» con alguna en falta = no completas.
  const raro = leerPropuesta(crudo({ necesidades: { completas: true, total: 3, respondidas: [], faltan: [{ id: 'lunas', etiqueta: 'Lunas', pregunta: '¿Lunas?', opciones: ['sí', 'no'] }] } }))!
  assert.equal(raro.necesidades.completas, false)
})

test('numerar: el número de un precio es ESTABLE cuando llegan otros (un botón viejo nunca apunta a otro precio)', () => {
  const a = numerar([], P.opciones)
  assert.deepEqual(a.map((o) => [o.clave, o.n]), [[OF2, 1], [OF1, 2], [`cds:${OF3}`, 3]])
  const nuevo = { ...P.opciones[0], clave: '66666666-6666-4666-8666-666666666666', primaEur: 300 }
  const b = numerar(a, [nuevo, ...P.opciones])
  assert.equal(b.find((o) => o.clave === OF2)!.n, 1)
  assert.equal(b.find((o) => o.clave === OF1)!.n, 2)
  assert.equal(b.find((o) => o.clave === nuevo.clave)!.n, 4)
})

test('numerar: la MISMA oferta con otra prima toma número nuevo (un botón viejo nunca envía una prima no vista)', () => {
  const a = numerar([], P.opciones)
  const subida = P.opciones.map((o) => (o.clave === OF2 ? { ...o, primaEur: o.primaEur + 25 } : o))
  const b = numerar(a, subida)
  assert.equal(b.find((o) => o.clave === OF2)!.n, 4, 'prima cambiada → número nuevo')
  assert.ok(!b.some((o) => o.n === 1), 'el número viejo deja de existir: su botón no envía nada')
  assert.equal(b.find((o) => o.clave === OF1)!.n, 2, 'el resto conserva su número')
})

test('botones §3.4: 📤 recomendada (clp_pro:<p>:<n>), 🔀, ✏️ y 🚫; ≤ 64 bytes; sin datos personales', () => {
  const b = botonesPropuesta(123, D).flat()
  assert.deepEqual(b.map((x) => x.callback), ['clp_pro:123:1', 'clp_eli:123', 'clp_edt:123', 'clp_no:123'])
  for (const x of b) assert.ok(Buffer.byteLength(x.callback!) <= 64)
  assert.ok(!b.some((x) => /@|juan/i.test(x.callback!)))
})

test('🔀 Elegir otra: SOLO los precios enviables tienen botón', () => {
  const b = botonesElegir(123, D).flat().map((x) => x.callback)
  assert.deepEqual(b, ['clp_pro:123:1', 'clp_no:123'])
})

test('falta UNA necesidad → no hay 📤 ni 🔀 (solo ✏️ y 🚫) y el aviso lo dice', () => {
  const sin = datosDePropuesta(leerPropuesta(crudo({
    necesidades: { completas: false, total: 3, respondidas: [], faltan: [{ id: 'lunas', etiqueta: 'Lunas', pregunta: '¿Quiere lunas?', opciones: ['sí', 'no'] }] },
    recomendada: null,
  }))!, CONTACTO, [])
  const b = botonesPropuesta(9, sin).flat().map((x) => x.callback)
  assert.deepEqual(b, ['clp_edt:9', 'clp_no:9'])
  assert.deepEqual(botonesElegir(9, sin).flat().map((x) => x.callback), ['clp_no:9'])
  assert.match(textoPropuestaTelegram({ id: 9, datos: sin, borrador: borradorPropuesta(sin) }), /IDD: necesidades 0\/3 ✗ · faltan: lunas/)
})

test('aviso §3.4: compañía · prima en eur() · franquicia · firmeza · coberturas · bloqueo · recomendada; sin email ni contacto', () => {
  const t = textoPropuestaTelegram({ id: 5, datos: D, borrador: borradorPropuesta(D) })
  assert.match(t, /1\. Mapfre 398,00€ · sin franquicia · estimado · Daños propios \(todo riesgo\), Lunas ← <b>recomendada<\/b>/)
  assert.match(t, /2\. Allianz 412,30€ · franquicia 300,00€/)
  assert.match(t, /⛔ La compañía la dejará BLOQUEADA \(INCENDIO-ROBO SIN DAÑOS\)/)
  assert.match(t, /3\. Reale 350,00€ .*Avant2/)
  assert.match(t, /IDD: necesidades 2\/2 ✓ · información previa ✓/)
  assert.ok(!t.includes('juan@example.com'), 'el email del lead no va a Telegram')
  assert.ok(t.length <= 4000)
})

test('el correo: información previa del mediador SIEMPRE (desde MEDIADOR) y la opción ELEGIDA tras el saludo', () => {
  const b = borradorPropuesta(D)
  assert.ok(llevaInformacionPrevia(b))
  assert.ok(b.includes(MEDIADOR.identidad.claveDgsfp))
  assert.ok(!/Mapfre|398/.test(b), 'el borrador no nombra ninguna opción: 🔀 puede elegir otra')
  const final = conOpcion(b, D.opciones[0])
  assert.match(final, /^Hola Juan:\n\nTe propongo Mapfre: 398,00€ al año, sin franquicia\. Es un precio estimado/)
})

test('repregunta IDD: cada necesidad con sus opciones, pie legal, y una clave por CONJUNTO (no una por pasada)', () => {
  const faltan = [{ id: 'lunas', etiqueta: 'Lunas', pregunta: '¿Quiere cobertura de lunas?', opciones: ['sí', 'no', 'le es indiferente'] }]
  const r = plantillaRepreguntaIdd({ pila: 'Juan', faltan, asuntoOriginal: 'Seguro coche' })!
  assert.equal(r.asunto, 'Re: Seguro coche')
  assert.match(r.cuerpo, /- ¿Quiere cobertura de lunas\? \(sí \/ no \/ le es indiferente\)/)
  assert.ok(r.cuerpo.includes(MEDIADOR.identidad.claveDgsfp))
  assert.equal(plantillaRepreguntaIdd({ pila: null, faltan: [], asuntoOriginal: 'x' }), null)
  assert.equal(claveRepreguntaIdd('7', [{ id: 'b' }, { id: 'a' }]), claveRepreguntaIdd('7', [{ id: 'a' }, { id: 'b' }]))
})

test('datos del pendiente: se releen sin fiarse; sin email, Message-ID u oportunidad única no hay envío', () => {
  assert.ok(leerDatosPropuesta(JSON.parse(JSON.stringify(D))))
  assert.equal(leerDatosPropuesta({ ...D, to: '' }), null)
  assert.equal(leerDatosPropuesta({ ...D, messageId: 'x' }), null)
  assert.equal(leerDatosPropuesta({ ...D, oportunidadIds: [] }), null)
  assert.equal(leerDatosPropuesta({ ...D, tipo: 'repregunta' }), null)
})

test('lo que contesta asegura: no salió (y si cambió el precio, se refresca) ≠ no se sabe', () => {
  assert.deepEqual(interpretarEnvioPropuesta(200, { estado: 'enviado', hilo: 'ok', historial: true }), { estado: 'enviado', repetido: false, hilo: 'ok', historial: true })
  const c = interpretarEnvioPropuesta(409, { estado: 'no_enviado', motivo: 'precio_cambiado', detalle: 'La prima ha cambiado' })
  assert.equal(c.estado, 'no_enviado')
  assert.equal(c.estado === 'no_enviado' && c.refrescar, true)
  const e = interpretarEnvioPropuesta(409, { estado: 'no_enviado', motivo: 'email_distinto', detalle: 'x' })
  assert.equal(e.estado === 'no_enviado' && e.refrescar, false)
  assert.equal(interpretarEnvioPropuesta(500, { estado: 'error' }).estado, 'incierto')
  assert.equal(interpretarEnvioPropuesta(502, { estado: 'fallo_envio' }).estado, 'incierto')
})

test('decidirBotonClp: 📤 exige id y número de precio válidos; solo el titular', () => {
  const cb = { from: { id: 42 } }
  assert.deepEqual(decidirBotonClp(cb, 'pro', ['12', '3'], '42'), { ok: true, accion: 'pro', id: 12, n: 3, quien: '42' })
  assert.equal(decidirBotonClp(cb, 'pro', ['12'], '42').ok, false)
  assert.equal(decidirBotonClp(cb, 'pro', ['12', '0'], '42').ok, false)
  assert.equal(decidirBotonClp({ from: { id: 7 } }, 'pro', ['12', '1'], '42').ok, false)
  assert.equal(decidirBotonClp(cb, 'eli', ['12'], '42').ok, true)
})

test('F2 con precio ya pedido: su respuesta actualiza la propuesta, NO vuelve a ofrecer tarificar', () => {
  const ok = (estadoHilo: unknown) => leerGuardar(200, { estado: 'ok', completo: true, estadoHilo, oportunidades: [{ id: 'x', ramo: 'auto', guardado: true, faltan: [] }] })
  assert.equal(hiloConPrecio(ok('tarificada')), true)
  assert.equal(hiloConPrecio(ok('propuesta_enviada')), true)
  assert.equal(hiloConPrecio(ok('lista_para_tarificar')), false)
  assert.equal(hiloConPrecio(ok(undefined)), false, 'sin decirlo asegura, se sigue como antes (F3a)')
  const fuente = readFileSync(new URL('./lead-correduria-respuesta-proceso.ts', import.meta.url), 'utf8')
  assert.ok(fuente.indexOf('hiloConPrecio(guardado)') < fuente.indexOf('ofrecerTarificacion({'), 'se mira ANTES de ofrecer tarificar')
})

// ─── Cepos del proceso (leen el FUENTE) ───────────────────────────────────────────────────────────────────────────

const PROC = readFileSync(new URL('./lead-correduria-propuesta-proceso.ts', import.meta.url), 'utf8')
const PEND = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8')

test('📤 es de un solo uso y manda EXACTAMENTE el precio n con la idempotencia del pendiente', () => {
  assert.match(PROC, /WHERE id = \$\{id\} AND tipo = 'propuesta' AND estado = 'pendiente' AND caduca_at > now\(\)\s*RETURNING datos, borrador/)
  assert.match(PROC, /datos\.opciones\.find\(\(x\) => x\.n === n\)/)
  assert.match(PROC, /clave: o\.clave, primaEur: o\.primaEur/)
  assert.match(PROC, /idempotencia: `clp-\$\{id\}`/)
})

test('✅ de una petición NUNCA envía una propuesta (su texto suelto, sin precio ni portal)', () => {
  // Tras juntarse con F3b la guarda es `tipo NOT IN ('tarificar', 'discrepancia', 'propuesta')`.
  assert.match(PEND, /SET estado = 'enviando'[^`]*WHERE id = \$\{d\.id\} AND tipo NOT IN \([^)]*'propuesta'[^)]*\) AND estado = 'pendiente'[^`]*RETURNING datos, borrador/)
})

test('el aviso se ACTUALIZA en sitio (un pendiente por hilo): no se duplica', () => {
  assert.match(PROC, /clavePendientePropuesta\(p\.hiloId\)/)
  assert.match(PROC, /if \(previo && previo\.huella === p\.huella\) return 'igual'/)
  assert.match(PROC, /tgEditMessage\(Number\(fila\.tg_message_id\), texto, \{ botones \}\)/)
  assert.match(PROC, /tgAvisoBotones\('correduria\.lead-propuesta'/)
})
