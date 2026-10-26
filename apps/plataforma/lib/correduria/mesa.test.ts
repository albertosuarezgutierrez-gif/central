import test from 'node:test'
import assert from 'node:assert/strict'
import {
  atajosAparcar, cuandoRelativo, fechaCorta, masDias, repartirMesa, repartirMesaCompleta, ordenarTareasSueltas, ordenarPerdidas,
  seccionMesa, motivosEntreManos, esSubida, esPeticion, SECCIONES_MESA, origenInsignia, textoVencimiento, textoAntiguedad,
} from './mesa.ts'
import type { Expediente, Expedientes, PerdidaPorRevisar, TareaSuelta } from './expedientes.ts'

const HOY = '2026-10-26'
const dia = (n: number) => masDias(HOY, n)

/**
 * Expediente NEUTRO: ningún brazo de «Entre manos» lo sube (creado hace 60 d, sin contacto humano que CONSTA, sin
 * vencimiento, siguiente paso futuro) → «Leads antiguos sin contacto». Cada test añade UNA cosa y comprueba que sube.
 */
const exp = (o: Partial<Expediente> = {}): Expediente => ({
  id: 'e1', clienteId: 'c1', cliente: 'Ana', ramo: 'auto', clase: 'venta_nueva', estadoVisible: 'abierta', estado: 'en_negociacion',
  delVolcado: false, aparcadaHasta: null, aparcadaMotivo: null,
  proximaAccion: { tareaId: 't1', texto: 'Llamar', tipo: 'llamada', fecha: dia(7) },
  prima: 100, fechaFinVigencia: null, notas: null, creada: dia(-60), rescate: null, contacto: null, trabajada: true, solicitudCompania: null,
  origen: 'ficha:manual', ultimoContacto: null, contactoConsta: true, presupuestos: null, vencimiento: null, ...o,
})
const con = (p: Partial<NonNullable<Expediente['proximaAccion']>> | null): Partial<Expediente> =>
  ({ proximaAccion: p === null ? null : { tareaId: 't', texto: '', tipo: 'llamada', fecha: dia(7), ...p } })
const SOL = { numero: '170000001', compania: 'occident', estado: 'PRIMA / PROY * PTE DOCUMENTACION', url: 'https://portaloccident.gco.global/x?idSubscripcio=00170000001', at: null }
const sec = (o: Partial<Expediente>) => seccionMesa(exp(o), HOY)

test('neutro: sin ningún brazo y con contacto que CONSTA que no existe → Leads antiguos sin contacto', () => {
  assert.equal(sec({}), 'leadsAntiguos')
})

// ── Un test por brazo del OR de «Entre manos» ───────────────────────────────────────────────────────
test('brazo (a): contacto humano ≤30 d sube, también un lead antiguo y una renovación de cartera; a 31 d no', () => {
  assert.equal(sec({ ultimoContacto: `${dia(-30)}T10:00:00.000Z` }), 'entreManos')
  assert.equal(sec({ ultimoContacto: `${dia(-31)}T10:00:00.000Z` }), 'leadsAntiguos')
  assert.equal(sec({ delVolcado: true, ultimoContacto: dia(-5) }), 'entreManos')
  assert.equal(sec({ trabajada: false, origen: 'renovacion_cartera', ultimoContacto: dia(-5) }), 'entreManos')
  assert.deepEqual(motivosEntreManos(exp({ ultimoContacto: dia(-5) }), HOY), ['contacto'])
})

test('brazo (b): petición explícita (correo:lead, web:*, portal:* incl. mejorar-precio y aviso-vencimiento)', () => {
  for (const origen of ['correo:lead', 'web:lead', 'web:aviso-vencimiento', 'portal:mejorar-precio', 'portal:patrimonio']) {
    assert.equal(sec({ origen }), 'entreManos', origen)
    assert.equal(esPeticion({ origen }), true, origen)
  }
  // Un origen que no es petición no sube por sí solo.
  assert.equal(sec({ origen: 'renovacion_cartera' }), 'leadsAntiguos')
})

test('brazo (b): una póliza SUBIDA al portal NO es petición (documento:portal / portal:declarada)', () => {
  for (const origen of ['documento:portal', 'portal:declarada']) {
    assert.equal(esSubida({ origen }), true, origen)
    assert.equal(esPeticion({ origen }), false, origen)
    assert.equal(motivosEntreManos(exp({ origen, vencimiento: dia(200) }), HOY).includes('peticion'), false, origen)
  }
})

test('brazo (c): siguiente paso vencido (hoy incluido) sube; mañana no', () => {
  assert.equal(sec(con({ fecha: HOY })), 'entreManos')
  assert.equal(sec(con({ fecha: dia(-90) })), 'entreManos')
  assert.equal(sec(con({ fecha: dia(1) })), 'leadsAntiguos')
  assert.equal(sec(con(null)), 'leadsAntiguos')
  assert.equal(sec(con({ fecha: null })), 'leadsAntiguos')
})

test('brazo (d): nº de solicitud en la compañía o esperando cliente', () => {
  assert.equal(sec({ solicitudCompania: SOL }), 'entreManos')
  assert.equal(sec({ estadoVisible: 'esperando_cliente', estado: 'pendiente_cliente' }), 'entreManos')
  // Una renovación sin contacto pero con nº de solicitud ya la marca asegura como trabajada: sale de «sin tocar».
  assert.equal(sec({ solicitudCompania: SOL, trabajada: true, origen: 'renovacion_cartera' }), 'entreManos')
})

test('brazo (e): rescate / retención con plazo de recibo', () => {
  assert.equal(sec({ clase: 'rescate' }), 'entreManos')
  assert.equal(sec({ clase: 'rescate', trabajada: false }), 'entreManos')
})

test('brazo (f): vencimiento de póliza ≤60 d (también ya vencida) sube; a 61 d no; null no esconde ni sube', () => {
  assert.equal(sec({ vencimiento: dia(60) }), 'entreManos')
  assert.equal(sec({ vencimiento: dia(-3) }), 'entreManos')
  assert.equal(sec({ vencimiento: dia(61) }), 'leadsAntiguos')
  assert.equal(sec({ vencimiento: null }), 'leadsAntiguos')
  // Aplica a cualquier operación, también a una renovación de cartera sin tocar.
  assert.equal(sec({ trabajada: false, origen: 'renovacion_cartera', vencimiento: dia(45) }), 'entreManos')
})

test('brazo (g): creada ≤21 d y no subida; una subida reciente no sube por esto', () => {
  assert.equal(sec({ creada: `${dia(-21)}T08:00:00.000Z` }), 'entreManos')
  assert.equal(motivosEntreManos(exp({ creada: dia(-22) }), HOY).includes('reciente'), false)
  assert.equal(motivosEntreManos(exp({ creada: dia(-21) }), HOY).includes('reciente'), true)
  assert.equal(sec({ creada: dia(-2), origen: 'documento:portal', vencimiento: dia(200) }), 'subidas')
})

// ── Secciones plegadas ──────────────────────────────────────────────────────────────────────────────
test('plegada «Pólizas subidas»: subida por el cliente con vencimiento >60 d; a ≤60 d sube sola a Entre manos', () => {
  assert.equal(sec({ origen: 'documento:portal', vencimiento: dia(61) }), 'subidas')
  assert.equal(sec({ origen: 'portal:declarada', vencimiento: dia(300), creada: dia(-100) }), 'subidas')
  assert.equal(sec({ origen: 'documento:portal', vencimiento: dia(60) }), 'entreManos')
  // Vencimiento que no se sabe: no se esconde.
  assert.equal(sec({ origen: 'documento:portal', vencimiento: null }), 'entreManos')
})

test('plegada «Leads antiguos»: del volcado, o sin contacto >30 d y creados hace >30 d; con contacto desconocido NO', () => {
  assert.equal(sec({ delVolcado: true, creada: dia(-127) }), 'leadsAntiguos')
  assert.equal(sec({ ultimoContacto: dia(-80), creada: dia(-90) }), 'leadsAntiguos')
  assert.equal(sec({ creada: dia(-31) }), 'leadsAntiguos')
  assert.equal(sec({ creada: dia(-30) }), 'entreManos', 'creada hace 30 d no es «>30»')
  // asegura vieja (no manda ultimoContacto): `null` es «no se sabe» → no se esconde.
  assert.equal(sec({ contactoConsta: false }), 'entreManos')
  // La antigüedad no sale de fechaFinVigencia (la del volcado está mal).
  assert.equal(sec({ fechaFinVigencia: '2023-01-01', creada: dia(-5) }), 'entreManos')
})

test('plegada «Renovaciones de cartera sin tocar»: trabajada===false salvo contacto, petición, rescate o vencimiento ≤60 d', () => {
  const ren = { trabajada: false, origen: 'renovacion_cartera' }
  assert.equal(sec(ren), 'renovaciones')
  // Su tarea vencida y su alta reciente son ruido del vencimiento: no la suben.
  assert.equal(sec({ ...ren, ...con({ fecha: dia(-10) }), creada: dia(-3) }), 'renovaciones')
  assert.equal(sec({ ...ren, vencimiento: dia(90) }), 'renovaciones')
  assert.equal(sec({ ...ren, trabajada: null }), 'leadsAntiguos', 'sin dato de trabajada no se manda a «sin tocar»')
})

test('aparcada: nunca sale fuera de Aparcadas, aunque cumpla todos los brazos', () => {
  const e = exp({ estadoVisible: 'aparcada', aparcadaHasta: '2027-01-10', clase: 'rescate', origen: 'web:lead', vencimiento: dia(5), ...con({ fecha: dia(-9) }) })
  assert.equal(seccionMesa(e, HOY), 'aparcadas')
})

test('nulos: origen, ultimoContacto y vencimiento null (no se sabe) no esconden nada', () => {
  assert.equal(sec({ origen: null, contactoConsta: false, ultimoContacto: null, vencimiento: null }), 'entreManos')
})

// ── Reparto y orden ─────────────────────────────────────────────────────────────────────────────────
test('repartir: cada expediente en UNA sección y no se pierde ninguno', () => {
  const lista = [
    exp({ id: 'a', ...con({ fecha: HOY }) }), exp({ id: 'b' }), exp({ id: 'c', estadoVisible: 'esperando_cliente' }),
    exp({ id: 'd', clase: 'rescate' }), exp({ id: 'e', estadoVisible: 'aparcada', aparcadaHasta: '2027-01-01' }),
    exp({ id: 'f', origen: 'documento:portal', vencimiento: dia(200) }), exp({ id: 'g', trabajada: false }),
  ]
  const r = repartirMesa(lista, HOY)
  const ids = SECCIONES_MESA.flatMap(b => r[b].map(x => x.id))
  assert.equal(ids.length, lista.length)
  assert.equal(new Set(ids).size, lista.length)
  assert.deepEqual(r.leadsAntiguos.map(x => x.id), ['b'])
  assert.deepEqual(r.subidas.map(x => x.id), ['f'])
  assert.deepEqual(r.renovaciones.map(x => x.id), ['g'])
  assert.deepEqual(r.aparcadas.map(x => x.id), ['e'])
  assert.deepEqual(r.entreManos.map(x => x.id).sort(), ['a', 'c', 'd'])
})

test('orden de Entre manos: vencido (más antiguo) → petición sin contacto → vence ≤60 (cercano) → recién → con contacto → pelota de otro', () => {
  const r = repartirMesa([
    exp({ id: 'pelota', clienteId: 'k1', solicitudCompania: SOL }),
    exp({ id: 'contacto', clienteId: 'k2', ultimoContacto: dia(-3) }),
    exp({ id: 'reciente', clienteId: 'k3', creada: dia(-5) }),
    exp({ id: 'vence50', clienteId: 'k4', vencimiento: dia(50) }),
    exp({ id: 'vence10', clienteId: 'k5', vencimiento: dia(10) }),
    exp({ id: 'peticion', clienteId: 'k6', origen: 'web:lead' }),
    exp({ id: 'vencidoReciente', clienteId: 'k7', ...con({ fecha: dia(-2) }) }),
    exp({ id: 'vencidoAntiguo', clienteId: 'k8', ...con({ fecha: dia(-40) }) }),
  ], HOY)
  assert.deepEqual(r.entreManos.map(x => x.id), ['vencidoAntiguo', 'vencidoReciente', 'peticion', 'vence10', 'vence50', 'reciente', 'contacto', 'pelota'])
})

test('orden: empate → prima mayor, prima null al final; luego id', () => {
  const r = repartirMesa([
    exp({ id: 'n', clienteId: 'k1', prima: null, ...con({ fecha: dia(-1) }) }),
    exp({ id: 'x', clienteId: 'k2', prima: 50, ...con({ fecha: dia(-1) }) }),
    exp({ id: 'z', clienteId: 'k3', prima: 300, ...con({ fecha: dia(-1) }) }),
  ], HOY)
  assert.deepEqual(r.entreManos.map(x => x.id), ['z', 'x', 'n'])
})

test('agrupa por clienteId (nunca por nombre): las del mismo cliente juntas, dos clientes homónimos no se funden', () => {
  const r = repartirMesa([
    exp({ id: 'a1', clienteId: 'A', cliente: 'Ana', ...con({ fecha: dia(-9) }) }),
    exp({ id: 'b1', clienteId: 'B', cliente: 'Ana', ...con({ fecha: dia(-5) }) }),
    exp({ id: 'a2', clienteId: 'A', cliente: 'Ana', ...con({ fecha: dia(-1) }) }),
  ], HOY)
  assert.deepEqual(r.entreManos.map(x => x.id), ['a1', 'a2', 'b1'])
})

test('tarjeta: insignia de origen, «vence en X d» y antigüedad; lo que no consta no se inventa', () => {
  assert.equal(origenInsignia(exp({ origen: 'portal:mejorar-precio' })), 'Portal')
  assert.equal(origenInsignia(exp({ origen: 'documento:portal' })), 'Portal')
  assert.equal(origenInsignia(exp({ origen: 'correo:lead' })), 'Correo')
  assert.equal(origenInsignia(exp({ origen: 'web:lead' })), 'Web')
  assert.equal(origenInsignia(exp({ origen: 'renovacion_cartera' })), 'Cartera')
  assert.equal(origenInsignia(exp({ origen: null, delVolcado: true })), 'Cartera')
  assert.equal(origenInsignia(exp({ origen: null })), null)
  assert.equal(textoVencimiento(exp({ vencimiento: dia(12) }), HOY), 'vence en 12 d')
  assert.equal(textoVencimiento(exp({ vencimiento: HOY }), HOY), 'vence hoy')
  assert.equal(textoVencimiento(exp({ vencimiento: dia(-3) }), HOY), 'vencida hace 3 d')
  assert.equal(textoVencimiento(exp({ vencimiento: null }), HOY), null)
  assert.equal(textoAntiguedad(exp({ creada: dia(-5) }), HOY), 'entró hace 5 d')
  assert.equal(textoAntiguedad(exp({ creada: `${HOY}T09:00:00Z` }), HOY), 'entró hoy')
})

test('subidas: por vencimiento, la más cercana primero', () => {
  const r = repartirMesa([
    exp({ id: 'l', origen: 'documento:portal', vencimiento: dia(300) }), exp({ id: 'k', origen: 'documento:portal', vencimiento: dia(100) }),
  ], HOY)
  assert.deepEqual(r.subidas.map(x => x.id), ['k', 'l'])
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
  assert.equal(cuandoRelativo(dia(-3), HOY), 'hace 3 d')
  assert.equal(cuandoRelativo(dia(1), HOY), 'mañana')
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
  texto: 'Llamar', fecha: HOY, origen: null, contacto: null, ...o,
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
    suelta({ tareaId: 'd', fecha: null }), suelta({ tareaId: 'c', fecha: dia(7) }),
    suelta({ tareaId: 'b', fecha: `${HOY}T08:00:00Z` }), suelta({ tareaId: 'a', fecha: '2026-09-30' }),
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
  assert.equal(SECCIONES_MESA.reduce((n, b) => n + r.bloques[b].length, 0), 2)
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

