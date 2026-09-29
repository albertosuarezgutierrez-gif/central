import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  elegirPrecioNuevo, esResumenNuevo, figurasPendientes, huellaResumenNuevo, precioCaducado, ramoNuevoValido, textoResumenNuevo,
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

test('preparar: sin matrícula, sin prima o sin efecto no hay botón; el resumen viejo caduca ANTES del ReRate', () => {
  assert.match(prep, /if \(!matricula\)/)
  assert.match(prep, /of\.primaEur === null \|\| !guardada\.fechaEfecto/)
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
