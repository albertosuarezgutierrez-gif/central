import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  decidirEfecto, elegirPrecioNuevo, esResumenNuevo, fechaEfectoDelPrecio, figurasPendientes, huellaResumenNuevo, leerFechaEfecto, precioCaducado, ramoNuevoValido, textoResumenNuevo,
  type ResumenEmisionNueva,
} from './correduria-emision-nueva-tg.ts'
import type { Precio } from './retarificar-asegura.ts'

// Precios con la forma de la tarificación real de la moto de un cliente (29/09/2026).
const P: Precio[] = [
  { compania: 'Allianz', producto: 'Allianz Motos', categoria: 'Terceros ampliado', primaEur: 200.2, opciones: [{ etiqueta: 'Modalidad', valor: 'Incendio + Robo' }] },
  { compania: 'Allianz', producto: 'Allianz Motos', categoria: 'Terceros', primaEur: 106.77 },
  { compania: 'Allianz', producto: 'Allianz Motos', categoria: 'Terceros ampliado', primaEur: 228.37, opciones: [{ etiqueta: 'Modalidad', valor: 'ALLIANZ MOTO PÉRDIDA TOTAL' }] },
  { compania: 'Occident', producto: 'Occident GCO Motos 3.0', categoria: 'Terceros', primaEur: 217.57 },
  { compania: 'Mapfre', producto: 'Mapfre Motos', categoria: 'Terceros', primaEur: null },
]

test('elige por compañía + palabras de la modalidad, sin tildes ni mayúsculas', () => {
  const r = elegirPrecioNuevo(P, 'allianz', 'incendio robo', null)
  assert.equal(r.tipo, 'uno')
  assert.equal(r.tipo === 'uno' && r.precio.primaEur, 200.2)
})

test('con varios candidatos pregunta, nunca elige por posición', () => {
  const r = elegirPrecioNuevo(P, 'Allianz', 'terceros ampliado', null)
  assert.equal(r.tipo, 'elegir')
  assert.equal(r.tipo === 'elegir' && r.precios.length, 2)
})

test('la prima desempata («la de 200»)', () => {
  const r = elegirPrecioNuevo(P, 'Allianz', 'terceros ampliado', 200)
  assert.equal(r.tipo === 'uno' && r.precio.primaEur, 200.2)
})

test('lo que dijo Alberto no se ignora: modalidad o prima que no casan → no, nunca otro precio', () => {
  assert.equal(elegirPrecioNuevo(P, 'Allianz', 'todo riesgo', null).tipo, 'no')
  assert.equal(elegirPrecioNuevo(P, 'Occident', null, 400).tipo, 'no')
})

test('un precio sin prima no es elegible, y una compañía que no está se dice', () => {
  assert.equal(elegirPrecioNuevo(P, 'Mapfre', null, null).tipo, 'no')
  assert.equal(elegirPrecioNuevo(P, 'Generali', null, null).tipo, 'no')
  assert.equal(elegirPrecioNuevo(P, '', null, null).tipo, 'no')
})

const R: ResumenEmisionNueva = {
  tipo: 'nuevo', clienteId: '94fa2f31-e135-4ec2-820f-b6c0b6f155a4', clienteNombre: 'Manuel Antonio', ramo: 'moto',
  matricula: '2121NST', tarificadaEn: '2026-09-29T13:54:54Z',
  tarificacionId: '700aeedd-ce09-411f-8b63-1245e8cc0561', projectId: '40967910', offerId: 'Q1', compania: 'Allianz',
  categoria: 'Terceros ampliado', producto: 'Allianz Motos', primaEur: 200.2, primaParrillaEur: 200.2, firmeza: 'firme',
  efecto: '2026-09-30', caduca: '2026-10-05', avisos: ['ESTA POLIZA QUEDARÁ BLOQUEADA'],
  cuenta: { enmascarada: 'ES72…5698', descripcion: 'de la ficha' }, figurasConfirmadas: [], cambiosFiguras: [],
}

test('la huella cambia si cambia un céntimo, la cuenta o las figuras confirmadas', () => {
  const h = huellaResumenNuevo(R)
  assert.equal(h, huellaResumenNuevo({ ...R }))
  assert.notEqual(h, huellaResumenNuevo({ ...R, primaEur: 200.21 }))
  assert.notEqual(h, huellaResumenNuevo({ ...R, cuenta: { enmascarada: 'ES00…0000', descripcion: null } }))
  assert.notEqual(h, huellaResumenNuevo({ ...R, figurasConfirmadas: ['cliente'] }))
})

test('el resumen enseña prima en formato español, cuenta enmascarada, avisos y que es irreversible', () => {
  const t = textoResumenNuevo(R)
  assert.match(t, /200,20€/)
  assert.match(t, /ES72…5698/)
  assert.match(t, /BLOQUEADA/)
  assert.match(t, /IRREVERSIBLE/)
  assert.match(t, /2121NST/)
  assert.doesNotMatch(t, /Esta variante cambia/)
})

test('con cambios de figuras el resumen los enumera y dice qué se confirma al pulsar', () => {
  const t = textoResumenNuevo({ ...R, figurasConfirmadas: ['cliente'], cambiosFiguras: [{ campo: 'propietario', antes: 'Manuel', despues: 'Global 2' }] })
  assert.match(t, /Manuel → Global 2/)
  assert.match(t, /arts\. 10 y 89 LCS/)
})

test('esResumenNuevo distingue las filas viejas (sin tipo) de las nuevas', () => {
  assert.equal(esResumenNuevo(R), true)
  assert.equal(esResumenNuevo({ polizaId: 'x', projectId: '1' }), false)
  assert.equal(esResumenNuevo(null), false)
})

test('precio caducado: sin fecha NO se presume caducado', () => {
  const ahora = new Date('2026-09-29T12:00:00Z')
  assert.equal(precioCaducado(null, ahora), false)
  assert.equal(precioCaducado('2026-09-28T00:00:00Z', ahora), true)
  assert.equal(precioCaducado('2026-10-05', ahora), false)
})

test('figurasPendientes y ramoNuevoValido', () => {
  assert.deepEqual(figurasPendientes(['conductor', 'cliente'], ['cliente']), ['conductor'])
  assert.deepEqual(figurasPendientes(['cliente'], ['cliente']), [])
  assert.equal(ramoNuevoValido('moto'), 'moto')
  assert.equal(ramoNuevoValido('hogar'), null)
})

test('fecha de efecto dictada: aaaa-mm-dd o dd/mm/aaaa; lo que no es una fecha del calendario se rechaza', () => {
  assert.deepEqual(leerFechaEfecto(undefined), { ok: true, fecha: null })
  assert.deepEqual(leerFechaEfecto('  '), { ok: true, fecha: null })
  assert.deepEqual(leerFechaEfecto('2026-10-09'), { ok: true, fecha: '2026-10-09' })
  assert.deepEqual(leerFechaEfecto('9/10/2026'), { ok: true, fecha: '2026-10-09' })
  assert.deepEqual(leerFechaEfecto('09/10/2026'), { ok: true, fecha: '2026-10-09' })
  // El 31 de septiembre no existe: Date lo pasaría al 1 de octubre sin avisar.
  assert.equal(leerFechaEfecto('2026-09-31').ok, false)
  assert.equal(leerFechaEfecto('31/09/2026').ok, false)
  assert.equal(leerFechaEfecto('9 de octubre').ok, false)
  assert.equal(leerFechaEfecto('2026/10/09').ok, false)
})

test('fecha del precio confirmado: solo effectiveDate ISO del nivel de arriba', () => {
  assert.equal(fechaEfectoDelPrecio({ effectiveDate: '2026-10-09T00:00:00Z' }), '2026-10-09')
  assert.equal(fechaEfectoDelPrecio({ effectiveDate: '09/10/2026' }), null)
  assert.equal(fechaEfectoDelPrecio({ quote: { effectiveDate: '2026-10-09' } }), null)
  assert.equal(fechaEfectoDelPrecio(null), null)
})

test('decidirEfecto: la fecha del botón nunca puede ser una que la compañía no haya aplicado sin que /emitir lo pare', () => {
  // Sin fecha pedida: la de la tarificación, como siempre.
  assert.deepEqual(decidirEfecto({ pedida: null, cotizada: '2026-10-01', cotizadaPasada: false, devuelta: '2026-10-01' }),
    { tipo: 'ok', efecto: '2026-10-01', cotizado: null, devuelto: null })
  // Pedida y devuelta igual: confirmada (vigente o pasada da igual).
  for (const cotizadaPasada of [true, false]) {
    assert.deepEqual(decidirEfecto({ pedida: '2026-10-09', cotizada: '2026-09-22', cotizadaPasada, devuelta: '2026-10-09' }),
      { tipo: 'ok', efecto: '2026-10-09', cotizado: '2026-09-22', devuelto: '2026-10-09' })
  }
  // Devuelta DISTINTA: nunca hay botón.
  for (const cotizadaPasada of [true, false]) {
    assert.equal(decidirEfecto({ pedida: '2026-10-09', cotizada: '2026-09-22', cotizadaPasada, devuelta: '2026-10-01' }).tipo, 'no')
  }
  // Sin devuelta y cotizada VIGENTE: /emitir no pararía una emisión con la vieja → no.
  assert.equal(decidirEfecto({ pedida: '2026-10-09', cotizada: '2026-10-01', cotizadaPasada: false, devuelta: null }).tipo, 'no')
  // Sin devuelta y cotizada PASADA: si no se aplicó, /emitir ve la vieja pasada y corta → sí, como «pedida».
  assert.deepEqual(decidirEfecto({ pedida: '2026-10-09', cotizada: '2026-09-22', cotizadaPasada: true, devuelta: null }),
    { tipo: 'ok', efecto: '2026-10-09', cotizado: '2026-09-22', devuelto: null })
})

test('resumen: «confirmada» solo si la compañía devolvió esa fecha; si no, «pedida»; sin cambio, nada', () => {
  const conf = textoResumenNuevo({ ...R, efecto: '2026-10-09', efectoCotizado: '2026-09-22', efectoDevuelto: '2026-10-09' })
  assert.match(conf, /Efecto <b>09\/10\/2026<\/b>/)
  assert.match(conf, /se cotizó con 22\/09\/2026; la compañía ha confirmado/)
  const pedida = textoResumenNuevo({ ...R, efecto: '2026-10-09', efectoCotizado: '2026-09-22', efectoDevuelto: null })
  assert.match(pedida, /se ha PEDIDO y la compañía no la devuelve/)
  assert.doesNotMatch(pedida, /ha confirmado el precio con la nueva/)
  assert.doesNotMatch(textoResumenNuevo(R), /se cotizó con/)
  // La huella cubre los dos campos nuevos (mismo efecto, distinto cotizado/devuelto).
  const base = { ...R, efecto: '2026-10-09', efectoCotizado: '2026-09-22', efectoDevuelto: null }
  assert.notEqual(huellaResumenNuevo(base), huellaResumenNuevo({ ...base, efectoCotizado: '2026-09-23' }))
  assert.notEqual(huellaResumenNuevo(base), huellaResumenNuevo({ ...base, efectoDevuelto: '2026-10-09' }))
})

// ── Cepos sobre el fuente ────────────────────────────────────────────────────────────────────────
const tg = readFileSync(fileURLToPath(new URL('./correduria-asistente-telegram.ts', import.meta.url)), 'utf8')
const prep = tg.slice(tg.indexOf('async function prepararEmisionNueva'), tg.indexOf('async function enviarPropuestaNueva'))
const boton = tg.slice(tg.indexOf('async function emitirNuevaTrasBoton'), tg.indexOf('export async function emitirDesdeBoton'))

test('preparar: el interruptor se mira antes de nada y el freno de envío dudoso va ANTES del ReRate', () => {
  assert.ok(prep.indexOf('emisionTgActiva(') > 0 && prep.indexOf('emisionTgActiva(') < prep.indexOf('ofertaAsegura('))
  assert.ok(prep.indexOf('if (dudoso !== 0)') > 0 && prep.indexOf('if (dudoso !== 0)') < prep.indexOf('ofertaAsegura('))
})

test('preparar: sin cuenta legible de la ficha no hay botón (por Telegram no se teclea IBAN)', () => {
  assert.match(prep, /if \(!of\.cuenta\)/)
  assert.doesNotMatch(prep, /iban:/)
})

test('botón: emite exigiendo la oferta del resumen (si otro ReRate la cambió, asegura no envía nada)', () => {
  assert.match(boton, /offerIdEsperado: r\.offerId/)
})

test('preparar: efecto pasado sin fecha nueva no llega al ReRate; con fecha, viaja al ReRate y la decide la compañía', () => {
  const corte = prep.indexOf('if (guardada.caducada && !fechaCorregida)')
  assert.ok(corte > 0 && corte < prep.indexOf('ofertaAsegura('))
  assert.match(prep, /fechaEfectoCorregida: fechaCorregida/)
  // La fecha del botón sale de decidirEfecto con lo que DEVOLVIÓ la compañía, y un «no» corta antes del resumen.
  assert.match(prep, /devuelta: fechaEfectoDelPrecio\(of\.quoteCrudo\)/)
  assert.ok(prep.indexOf("if (ef.tipo === 'no')") > prep.indexOf('ofertaAsegura(') && prep.indexOf("if (ef.tipo === 'no')") < prep.indexOf('enviarPropuestaNueva('))
  assert.match(prep, /efecto: ef\.efecto,/)
  // Una fecha mal escrita corta ANTES de leer nada (ni la tarificación ni el ReRate).
  assert.ok(prep.indexOf('if (!fe.ok)') < prep.indexOf('tarificacionNuevaGuardadaAsegura('))
})

test('preparar: sin matrícula, sin prima o sin efecto no hay botón; el resumen viejo caduca ANTES del ReRate', () => {
  assert.match(prep, /if \(!matricula\)/)
  assert.match(prep, /of\.primaEur === null \|\| !ef\.efecto/)
  assert.ok(prep.indexOf("SET estado = 'caducada'") > 0 && prep.indexOf("SET estado = 'caducada'") < prep.indexOf('ofertaAsegura('))
})

test('botón: huella y caducidad ANTES de emitir; emite con la cuenta del resumen y el actor del asistente', () => {
  assert.ok(boton.indexOf('huellaResumenNuevo(r) !== huellaGuardada') < boton.indexOf('emitirAsegura('))
  assert.ok(boton.indexOf('precioCaducado(') < boton.indexOf('emitirAsegura('))
  assert.match(boton, /cuentaConfirmada: r\.cuenta\.enmascarada/)
  assert.match(boton, /actor: ACTOR_EMISION_TG/)
})

test('el botón de siempre deriva las filas nuevas ANTES de usar su poliza_id (que es NULL)', () => {
  const cuerpo = tg.slice(tg.indexOf('export async function emitirDesdeBoton'))
  assert.ok(cuerpo.indexOf('esResumenNuevo(fila.resumen)') > 0)
  assert.ok(cuerpo.indexOf('esResumenNuevo(fila.resumen)') < cuerpo.indexOf('urlPoliza(fila.poliza_id)'))
})

const tarif = tg.slice(tg.indexOf('export async function tarificarDesdeBoton'))

test('botón Tarificar: cotiza con la oportunidad y sus figuras, y SOLO tras «hecha» prepara el botón de emitir', () => {
  const cot = tarif.slice(tarif.indexOf('const entrada = {'), tarif.indexOf('cotizarMotoNuevaAsegura('))
  assert.match(cot, /oportunidadId: fila\.cuerpo\?\.oportunidadId/)
  assert.match(cot, /figuras: fila\.cuerpo\?\.figuras/)
  const i = tarif.indexOf('prepararEmisionNueva(')
  assert.ok(i > 0 && tarif.lastIndexOf("fin.estado === 'hecha'", i) > 0)
})

test('proponer: el objetivo de emisión viaja en la fila y el seguro anterior se hereda antes de pagar', () => {
  const prop = tg.slice(tg.indexOf('async function proponerTarificacion'), tg.indexOf('async function pedirOProponer'))
  assert.match(prop, /\.\.\.\(objetivo \? \{ objetivo \} : \{\}\)/)
  assert.ok(prop.indexOf('historialHeredado(') > 0 && prop.indexOf('historialHeredado(') < prop.indexOf('INSERT INTO correduria_asistente_tarificacion'))
})

test('elegir precio: la modalidad guardada cuenta («incendio robo» casa aunque no esté en opciones)', () => {
  const r = elegirPrecioNuevo([{ compania: 'Allianz', producto: 'Allianz Motos', categoria: 'Terceros ampliado', primaEur: 200.2, modalidad: 'Incendio + Robo' }], 'Allianz', 'incendio robo', 200)
  assert.equal(r.tipo, 'uno')
})

test('emisión encadenada: solo con proyecto real y SOLO ese proyecto; herencia solo con las dos matrículas iguales', () => {
  assert.match(tarif, /res\.estado === 'ok' && !res\.simulado \? res\.projectId : null/)
  assert.match(tarif, /projectIdEsperado: proyectoNuevo/)
  assert.match(prep, /guardada\.projectId !== projectEsperado/)
  const her = tg.slice(tg.indexOf('async function historialHeredado'), tg.indexOf('async function historialHeredado') + 800)
  assert.match(her, /if \(!matricula \|\| !h\.matricula \|\|/)
})

test('bloqueo anunciado por la compañía: va ARRIBA del resumen, con el consejo de emitir la básica', () => {
  const t = textoResumenNuevo({ ...R, avisos: ['Observaciones de la compañía: ESTA POLIZA QUEDARÁ BLOQUEADA POR LA SIGUIENTE RAZÓN: INCENDIO-ROBO SIN DAÑOS, Prima calculada'] })
  assert.ok(t.indexOf('⛔') >= 0 && t.indexOf('⛔') < t.indexOf('Emisión NUEVA'))
  assert.match(t, /INCENDIO-ROBO SIN DAÑOS.*básica/)
})
