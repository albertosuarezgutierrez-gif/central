import test from 'node:test'
import assert from 'node:assert/strict'
import {
  atajosAparcar, bloqueDe, cuandoRelativo, fechaCorta, masDias, repartirMesa, repartirMesaCompleta, ordenarTareasSueltas, ordenarPerdidas, BLOQUES_MESA,
} from './mesa.ts'
import type { Expediente, Expedientes, PerdidaPorRevisar, TareaSuelta } from './expedientes.ts'

const HOY = '2026-10-13'
const exp = (o: Partial<Expediente> = {}): Expediente => ({
  id: 'e1', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', clase: 'venta_nueva', estadoVisible: 'abierta', estado: 'en_negociacion',
  delVolcado: false, aparcadaHasta: null, aparcadaMotivo: null,
  proximaAccion: { tareaId: 't1', texto: 'Llamar', tipo: 'llamada', fecha: '2026-10-20' },
  prima: 100, fechaFinVigencia: null, notas: null, creada: '2026-10-01', rescate: null, contacto: null, trabajada: true, solicitudCompania: null, ...o,
})
const con = (p: Partial<NonNullable<Expediente['proximaAccion']>> | null): Partial<Expediente> =>
  ({ proximaAccion: p === null ? null : { tareaId: 't', texto: '', tipo: 'llamada', fecha: '2026-10-20', ...p } })

test('bloques: hoy y vencido incluye hoy y fechas pasadas, no mañana', () => {
  assert.equal(bloqueDe(exp(con({ fecha: HOY })), HOY), 'hoy')
  assert.equal(bloqueDe(exp(con({ fecha: '2026-09-01' })), HOY), 'hoy')
  assert.equal(bloqueDe(exp(con({ fecha: '2026-10-14' })), HOY), 'abiertas')
})

test('bloques: sin fecha o sin próxima acción NO es hoy', () => {
  assert.equal(bloqueDe(exp(con({ fecha: null })), HOY), 'abiertas')
  assert.equal(bloqueDe(exp(con(null)), HOY), 'abiertas')
})

test('bloques: una aparcada nunca sale fuera de Aparcadas, aunque su acción esté vencida', () => {
  const e = exp({ estadoVisible: 'aparcada', aparcadaHasta: '2027-01-10', ...con({ fecha: '2026-09-01' }) })
  assert.equal(bloqueDe(e, HOY), 'aparcadas')
})

test('bloques: renovación automática sin contacto va a «Renovaciones sin tocar», no a Hoy/Abiertas/Esperando', () => {
  assert.equal(bloqueDe(exp({ trabajada: false, ...con({ fecha: HOY }) }), HOY), 'sinTocar')
  assert.equal(bloqueDe(exp({ trabajada: false }), HOY), 'sinTocar')
  assert.equal(bloqueDe(exp({ trabajada: false, estadoVisible: 'abierta' }), HOY), 'sinTocar')
  // Una renovación pasada a «esperando cliente» la marca asegura como trabajada (estado ≠ competencia): sale en Esperando.
  assert.equal(bloqueDe(exp({ trabajada: true, estadoVisible: 'esperando_cliente' }), HOY), 'esperando')
  // Trabajada, o sin dato (null: versión vieja de asegura), NO se esconde.
  assert.equal(bloqueDe(exp({ trabajada: true, ...con({ fecha: HOY }) }), HOY), 'hoy')
  assert.equal(bloqueDe(exp({ trabajada: null, ...con({ fecha: HOY }) }), HOY), 'hoy')
  // Un rescate nunca se esconde; una aparcada sigue en Aparcadas.
  assert.equal(bloqueDe(exp({ trabajada: false, clase: 'rescate' }), HOY), 'rescates')
  assert.equal(bloqueDe(exp({ trabajada: false, estadoVisible: 'aparcada', aparcadaHasta: '2027-01-10' }), HOY), 'aparcadas')
})

test('bloques: rescate y esperando cliente', () => {
  assert.equal(bloqueDe(exp({ clase: 'rescate' }), HOY), 'rescates')
  assert.equal(bloqueDe(exp({ estadoVisible: 'esperando_cliente' }), HOY), 'esperando')
  assert.equal(bloqueDe(exp({ clase: 'rescate', ...con({ fecha: HOY }) }), HOY), 'hoy')
})

test('repartir: cada expediente en UN solo bloque y no se pierde ninguno', () => {
  const lista = [
    exp({ id: 'a', ...con({ fecha: HOY }) }), exp({ id: 'b' }), exp({ id: 'c', estadoVisible: 'esperando_cliente' }),
    exp({ id: 'd', clase: 'rescate' }), exp({ id: 'e', estadoVisible: 'aparcada', aparcadaHasta: '2027-01-01' }),
    exp({ id: 'f', clase: 'rescate', estadoVisible: 'esperando_cliente' }),
  ]
  const r = repartirMesa(lista, HOY)
  const ids = BLOQUES_MESA.flatMap(b => r[b].map(x => x.id))
  assert.equal(ids.length, lista.length)
  assert.equal(new Set(ids).size, lista.length)
  assert.deepEqual(r.hoy.map(x => x.id), ['a'])
  assert.deepEqual(r.rescates.map(x => x.id).sort(), ['d', 'f'])
})

test('orden: fecha más antigua primero, sin fecha al final, prima mayor, prima null última', () => {
  const r = repartirMesa([
    exp({ id: 'x', ...con({ fecha: '2026-10-25' }), prima: 50 }),
    exp({ id: 'y', ...con({ fecha: null }), prima: 999 }),
    exp({ id: 'z', ...con({ fecha: '2026-10-25' }), prima: 300 }),
    exp({ id: 'n', ...con({ fecha: '2026-10-25' }), prima: null }),
    exp({ id: 'w', ...con({ fecha: '2026-10-15' }), prima: 1 }),
  ], HOY)
  assert.deepEqual(r.abiertas.map(x => x.id), ['w', 'z', 'x', 'n', 'y'])
})

test('aparcadas: la que vuelve antes primero', () => {
  const r = repartirMesa([
    exp({ id: 'l', estadoVisible: 'aparcada', aparcadaHasta: '2027-06-01' }),
    exp({ id: 'k', estadoVisible: 'aparcada', aparcadaHasta: '2026-12-01' }),
  ], HOY)
  assert.deepEqual(r.aparcadas.map(x => x.id), ['k', 'l'])
})

test('fechas: relativo, corta y atajos de aparcar', () => {
  assert.equal(cuandoRelativo(HOY, HOY), 'hoy')
  assert.equal(cuandoRelativo('2026-10-10', HOY), 'hace 3 d')
  assert.equal(cuandoRelativo('2026-10-14', HOY), 'mañana')
  assert.equal(cuandoRelativo(null, HOY), 'sin fecha')
  assert.equal(cuandoRelativo('2026-12-02T10:00:00Z', HOY), '2 dic')
  assert.equal(fechaCorta('2027-03-15', HOY), '15 mar 2027')
  assert.equal(masDias('2026-12-30', 3), '2027-01-02')
  const a = atajosAparcar('2026-08-31')
  assert.deepEqual(a.map(x => x.fecha), ['2026-11-30', '2027-02-28', '2027-08-31'])
  // Ningún atajo pasa el máximo del puerto (13 meses ≈ 395 d).
  for (const x of atajosAparcar('2028-02-29')) assert.ok(Date.parse(x.fecha) - Date.parse('2028-02-29') <= 395 * 86_400_000)
})

const suelta = (o: Partial<TareaSuelta> = {}): TareaSuelta => ({
  tareaId: 't1', clienteId: 'c1', cliente: 'Ana', polizaId: null, siniestroId: null, tipo: 'llamada', estado: 'pendiente',
  texto: 'Llamar', fecha: '2026-10-13', origen: null, contacto: null, ...o,
})
const perdida = (o: Partial<PerdidaPorRevisar> = {}): PerdidaPorRevisar => ({
  id: 'p1', tipo: 'baja', titulo: 'Baja', clienteId: 'c1', cliente: 'Ana', polizaId: 'z1', polizaNumero: '1', aseguradora: null,
  motivo: null, anulacion: null, ultimoRecibo: null, nota: null, contacto: null, ...o,
})
type Ok = Extract<Expedientes, { estado: 'ok' }>
const datos = (o: Partial<Ok> = {}): Ok => ({
  estado: 'ok', hoy: HOY, expedientes: [], tareasSueltas: [], tareasSueltasTruncado: false, perdidasPorRevisar: [],
  perdidasConExpediente: 0, recuento: null, truncado: false, descartadas: 0, ...o,
})

test('tareas sueltas: vencida = fecha <= hoy; sin fecha NO es vencida y va al final', () => {
  const r = ordenarTareasSueltas([
    suelta({ tareaId: 'd', fecha: null }), suelta({ tareaId: 'c', fecha: '2026-10-20' }),
    suelta({ tareaId: 'b', fecha: '2026-10-13T08:00:00Z' }), suelta({ tareaId: 'a', fecha: '2026-09-30' }),
  ], HOY)
  assert.deepEqual(r.map(t => t.tareaId), ['a', 'b', 'c', 'd'])
  assert.deepEqual(r.map(t => t.vencida), [true, true, false, false])
})

test('pérdidas: orden estable por cliente; sin nombre al final', () => {
  const r = ordenarPerdidas([perdida({ id: 'z', cliente: null }), perdida({ id: 'b', cliente: 'Zoe' }), perdida({ id: 'a', cliente: 'ana' })])
  assert.deepEqual(r.map(p => p.id), ['a', 'b', 'z'])
})

test('mesa completa: null = «no se pudo leer», [] = comprobado y vacío; nunca se confunden', () => {
  const noLeido = repartirMesaCompleta(datos({ tareasSueltas: null, perdidasPorRevisar: null, perdidasConExpediente: null }), HOY)
  assert.deepEqual(noLeido.sueltas, { estado: 'no_leido' })
  assert.deepEqual(noLeido.perdidas, { estado: 'no_leido' })
  assert.equal(noLeido.perdidasConExpediente, null)
  const vacio = repartirMesaCompleta(datos(), HOY)
  assert.deepEqual(vacio.sueltas, { estado: 'ok', filas: [] })
  assert.deepEqual(vacio.perdidas, { estado: 'ok', filas: [] })
  assert.equal(vacio.perdidasConExpediente, 0)
})

test('mesa completa: reparte expedientes, sueltas y pérdidas sin perder ninguna', () => {
  const r = repartirMesaCompleta(datos({
    expedientes: [exp({ id: 'a', ...con({ fecha: HOY }) }), exp({ id: 'b' })],
    tareasSueltas: [suelta({ tareaId: 's1' }), suelta({ tareaId: 's2', fecha: null })], tareasSueltasTruncado: true,
    perdidasPorRevisar: [perdida({ id: 'p1' }), perdida({ id: 'p2', cliente: 'Zoe' })],
  }), HOY)
  assert.equal(BLOQUES_MESA.reduce((n, b) => n + r.bloques[b].length, 0), 2)
  assert.equal(r.sueltas.estado === 'ok' ? r.sueltas.filas.length : -1, 2)
  assert.equal(r.sueltasTruncado, true)
  assert.equal(r.perdidas.estado === 'ok' ? r.perdidas.filas.length : -1, 2)
})

test('motivoFalloTareaSuelta: 2xx = guardado; 409/404 dicen su motivo; 5xx = ambiguo', async () => {
  const { motivoFalloTareaSuelta: m } = await import('./mesa.ts')
  assert.equal(m(200, { estado: 'ok' }), null)
  assert.match(m(409, { motivo: 'hito de devolución' }) ?? '', /No se ha guardado: hito de devolución/)
  assert.match(m(409, null) ?? '', /No se ha guardado/)
  assert.match(m(404, {}) ?? '', /ya no existe/)
  assert.match(m(502, null) ?? '', /No se ha podido confirmar/)
  assert.match(m(422, { estado: 'invalido', motivo: 'Falta tareaId' }) ?? '', /Falta tareaId/)
  assert.notEqual(m(200, { estado: 'error' }), null)
})

// «En la compañía» (20/10/2026).
const SOL = { numero: '170000001', compania: 'occident', estado: 'PRIMA / PROY * PTE DOCUMENTACION', url: 'https://portaloccident.gco.global/x?idSubscripcio=00170000001', at: null }

test('bloques: con nº de solicitud en la compañía → «En la compañía», antes de Abiertas', () => {
  assert.equal(bloqueDe(exp({ solicitudCompania: SOL }), HOY), 'compania')
  assert.equal(bloqueDe(exp({ solicitudCompania: SOL, estadoVisible: 'esperando_cliente' }), HOY), 'compania')
  assert.ok(BLOQUES_MESA.indexOf('compania') < BLOQUES_MESA.indexOf('abiertas'))
})

test('bloques: en la compañía con la tarea de HOY (p. ej. enviar documentación) → Hoy; aparcada → Aparcadas', () => {
  assert.equal(bloqueDe(exp({ solicitudCompania: SOL, ...con({ fecha: HOY }) }), HOY), 'hoy')
  assert.equal(bloqueDe(exp({ solicitudCompania: SOL, estadoVisible: 'aparcada', aparcadaHasta: '2027-01-10' }), HOY), 'aparcadas')
})

test('bloques: una renovación sin contacto pero con nº de solicitud NO va a «sin tocar»', () => {
  assert.equal(bloqueDe(exp({ solicitudCompania: SOL, trabajada: false }), HOY), 'compania')
  assert.equal(bloqueDe(exp({ solicitudCompania: null, trabajada: false }), HOY), 'sinTocar')
})
