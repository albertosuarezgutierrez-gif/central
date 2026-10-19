// `node --test`. Vehículo encadenado Allianz/Mapfre → Generali (18/10/2026, regla de Alberto). Datos SINTÉTICOS de catálogo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAVE_ESPERA_VEHICULO,
  ESPERA_MAXIMA_VEHICULO_MS,
  MOTIVO_CANCELADO_CADUCADO,
  MOTIVO_CANCELADO_SIN_ORIGEN,
  ESPERA_MAXIMA_IDENTIFICACION_MS,
  MOTIVO_LIBERADO_CADUCADO,
  MOTIVO_LIBERADO_ORIGEN_BLOQUEADO,
  MOTIVO_LIBERADO_SIN_ORIGEN,
  esperaLiberable,
  MOTIVO_SIN_OPORTUNIDAD,
  decidirEspera,
  enEsperaVehiculo,
  esOrigenVehiculo,
  leerVehiculoWorker,
  necesitaVehiculoEncadenado,
  riesgoAlEncolar,
  riesgoConVehiculo,
  tieneVehiculo,
  validarSeleccionCatalogo,
  vehiculoDeOrigenes,
  vehiculoParaRiesgoOrigen,
} from './tarificador-espera-vehiculo.ts'
import { leerResultadoWorker } from './tarificador-reglas.ts'

const VC = { origen: 'mapfre', denominacion: 'SEAT IBIZA 1.0 TSI STYLE', cv: 95, cc: 999, puertas: 5, fechaInicio: '2017-06-01' }
const SV = { marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI STYLE' }
const riesgo = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003' }
const OP = '11111111-1111-4111-8111-111111111111'

test('solo Generali Turismos espera el vehículo; solo Allianz/Mapfre AUTO lo dan', () => {
  assert.equal(necesitaVehiculoEncadenado('generali', 'auto'), true)
  assert.equal(necesitaVehiculoEncadenado(' Generali ', 'auto'), true)
  assert.equal(necesitaVehiculoEncadenado('generali', 'moto'), false)
  assert.equal(necesitaVehiculoEncadenado('mapfre', 'auto'), false)
  assert.equal(esOrigenVehiculo('allianz', 'auto'), true)
  assert.equal(esOrigenVehiculo('mapfre', 'auto'), true)
  assert.equal(esOrigenVehiculo('mapfre', 'moto'), false)
  assert.equal(esOrigenVehiculo('generali', 'auto'), false)
})

test('worker: el vehículo es ACCESORIO; lo válido se lee, lo inválido se descarta sin tumbar el resultado', () => {
  assert.deepEqual(leerVehiculoWorker({}), { vehiculo: null, descartado: [] })
  assert.deepEqual(leerVehiculoWorker({ seleccionVehiculo: SV }).vehiculo, { seleccionVehiculo: SV })
  assert.deepEqual(leerVehiculoWorker({ vehiculoConfirmado: VC }).vehiculo, { vehiculoConfirmado: VC })
  const malo = leerVehiculoWorker({ seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA', matricula: '1234BCD' }, vehiculoConfirmado: { ...VC, bastidor: 'X' } })
  assert.deepEqual(malo, { vehiculo: null, descartado: ['seleccionVehiculo', 'vehiculoConfirmado'] })
  assert.equal(validarSeleccionCatalogo({ marca: 'SEAT', modelo: 'IBIZA', descripcion: '1234 BCD' }), null, 'una matrícula en la versión no pasa')
  assert.equal(validarSeleccionCatalogo({ marca: 'SEAT', modelo: ' ' }), null)
})

test('resultado ok del worker: lleva `vehiculo` (o null) y un vehículo inválido no tumba el ok', () => {
  const base = { trabajoId: OP, resultado: 'ok', ofertas: [{ compania: 'mapfre', producto: 'Auto', primaAnualEur: 400 }], pdfs: [] }
  const con = leerResultadoWorker({ ...base, seleccionVehiculo: SV })
  assert.ok(con.ok && con.r.tipo === 'ok' && con.r.vehiculo?.seleccionVehiculo?.marca === 'SEAT')
  const sin = leerResultadoWorker({ ...base, seleccionVehiculo: { marca: 'x' } })
  assert.ok(sin.ok && sin.r.tipo === 'ok' && sin.r.vehiculo === null)
})

test('origen: se guarda `vehiculoCatalogo` (con su compañía) y `vehiculoConfirmado`; el `seleccionVehiculo` del formulario no cuenta', () => {
  assert.deepEqual(vehiculoParaRiesgoOrigen('allianz', { seleccionVehiculo: SV }), { vehiculoCatalogo: { origen: 'allianz', ...SV } })
  const filas = [
    { compania: 'allianz', ramo: 'auto', riesgo: { ramo: 'auto', seleccionVehiculo: { marca: 'TECLEADO', modelo: 'X' } }, terminadoAt: new Date('2026-10-18T10:00:00Z') },
  ]
  assert.equal(vehiculoDeOrigenes(filas), null, 'tecleado en el formulario ≠ confirmado por el bot')
  const conCat = [
    { compania: 'allianz', ramo: 'auto', riesgo: { vehiculoCatalogo: { origen: 'allianz', ...SV } }, terminadoAt: new Date('2026-10-18T09:00:00Z') },
    { compania: 'mapfre', ramo: 'auto', riesgo: { vehiculoConfirmado: VC }, terminadoAt: new Date('2026-10-18T10:00:00Z') },
    { compania: 'occident', ramo: 'auto', riesgo: { vehiculoCatalogo: { origen: 'occident', marca: 'OTRA', modelo: 'Z' } }, terminadoAt: new Date('2026-10-18T11:00:00Z') },
  ]
  assert.deepEqual(vehiculoDeOrigenes(conCat), { seleccionVehiculo: SV, vehiculoConfirmado: VC })
})

test('encolar Generali: con vehículo, tal cual; con un ok de origen, con él; sin oportunidad, rechazo; si no, en espera', () => {
  const conSv = riesgoAlEncolar({ ...riesgo, seleccionVehiculo: SV }, null, null)
  assert.deepEqual(conSv, { ok: true, riesgo: { ...riesgo, seleccionVehiculo: SV }, enEspera: false })
  const deOrigen = riesgoAlEncolar(riesgo, OP, { vehiculoConfirmado: VC as never })
  assert.ok(deOrigen.ok && !deOrigen.enEspera && tieneVehiculo(deOrigen.riesgo))
  assert.deepEqual(riesgoAlEncolar(riesgo, null, null), { ok: false, status: 422, motivo: MOTIVO_SIN_OPORTUNIDAD })
  const espera = riesgoAlEncolar(riesgo, OP, null)
  assert.ok(espera.ok && espera.enEspera && enEsperaVehiculo(espera.riesgo))
  assert.equal((espera as { riesgo: Record<string, unknown> }).riesgo[CLAVE_ESPERA_VEHICULO], true)
})

test('inyectar: quita la marca de espera y pone el vehículo', () => {
  const r = riesgoConVehiculo({ ...riesgo, [CLAVE_ESPERA_VEHICULO]: true }, { seleccionVehiculo: SV })
  assert.deepEqual(r, { ...riesgo, seleccionVehiculo: SV })
  assert.equal(enEsperaVehiculo(r), false)
  assert.equal(tieneVehiculo(r), true)
})

test('barrido: inyecta si hay vehículo; espera con un origen vivo; cancela sin origen vivo o pasadas 24 h', () => {
  const t0 = new Date('2026-10-18T08:00:00Z')
  const luego = (ms: number) => new Date(t0.getTime() + ms)
  assert.equal(decidirEspera({ vehiculo: { seleccionVehiculo: SV }, origenesVivos: 0, creadoAt: t0, ahora: luego(1000) }).tipo, 'inyectar')
  assert.deepEqual(decidirEspera({ vehiculo: null, origenesVivos: 1, creadoAt: t0, ahora: luego(60_000) }), { tipo: 'esperar' })
  assert.deepEqual(decidirEspera({ vehiculo: null, origenesVivos: 0, creadoAt: t0, ahora: luego(60_000) }), { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_SIN_ORIGEN })
  assert.deepEqual(decidirEspera({ vehiculo: null, origenesVivos: 2, creadoAt: t0, ahora: luego(ESPERA_MAXIMA_VEHICULO_MS) }), { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_CADUCADO })
})

// Cableado en el orquestador (lib/tarificador.ts): un brazo por sitio; quitar uno lo pone en rojo.
import { readFileSync } from 'node:fs'
const SRC = readFileSync(new URL('./tarificador.ts', import.meta.url), 'utf8')
const tramo = (desde: string, hasta: string) => SRC.slice(SRC.indexOf(desde), SRC.indexOf(hasta, SRC.indexOf(desde) + 1))

test('cableado · encolar: Generali pasa por riesgoAlEncolar con los ok de origen de SU oportunidad', () => {
  const t = tramo('export async function encolarTrabajo', '// ─── Reclamar y lanzar')
  assert.match(t, /if \(necesitaVehiculoEncadenado\(e\.compania, e\.ramo\)\) \{/)
  assert.match(t, /riesgoAlEncolar\(e\.riesgo, e\.oportunidadId, vehiculoDeOrigenes\(origenes\)\)/)
})

test('cableado · reclamar: un trabajo en espera del vehículo NO se reclama', () => {
  assert.match(tramo('export async function reclamarSiguiente', 'export type DepsLanzador'), /then w\.riesgo -> \$\{CLAVE_ESPERA_VEHICULO\}::text end\) is null/)
})

test('cableado · resultado ok de Allianz/Mapfre: guarda el catálogo en su riesgo e inyecta a los que esperan, ANTES de purgar', () => {
  const t = tramo('export async function registrarResultado', 'async function guardarTarificacionRpa')
  const guarda = t.indexOf('vehiculoParaRiesgoOrigen(t.compania, r.vehiculo)')
  const inyecta = t.indexOf('inyectarVehiculoEnEspera(tx, t.correduria_id, t.oportunidad_id, r.vehiculo)')
  const purga = t.indexOf('await purgarRiesgoTrabajos(tx, [t.id])', inyecta)
  assert.ok(guarda > 0 && inyecta > guarda && purga > inyecta)
  assert.match(t, /if \(r\.vehiculo && esOrigenVehiculo\(t\.compania, t\.ramo\)\) \{/)
})

test('cableado · barrido: resuelve las esperas (inyectar o cancelar) antes de lanzar', () => {
  const t = tramo('export async function barrerTarificadorRpa', '// ─── Vehículo encadenado')
  assert.ok(t.indexOf('resolverEsperasVehiculo(correduriaId)') > 0 && t.indexOf('resolverEsperasVehiculo(correduriaId)') < t.indexOf('lanzarPendientes(correduriaId, c.compania, deps)'))
})

test('cableado · toda consulta de las esperas va por correduría (aislamiento del código: BYPASSRLS)', () => {
  const t = SRC.slice(SRC.indexOf('// ─── Vehículo encadenado (Generali'))
  const consultas = t.match(/(select|update)[^`]*from seguros\.tarificacion_trabajos[^`]*`|update seguros\.tarificacion_trabajos[^`]*`/g) ?? []
  assert.ok(consultas.length >= 4)
  for (const q of consultas) assert.match(q, /correduria_id = \$\{correduriaId\}::uuid/, q.slice(0, 80))
})

test('cableado · barrido de esperas: cuenta los orígenes vivos ANTES de leer los ok, y solo cancela si SIGUE en espera', () => {
  const t = tramo('async function resolverEsperasVehiculo(', '\n}\n')
  // El nombre del schema va partido: este test solo LEE el fuente, no consulta (guardián de aislamiento).
  const vivos = t.indexOf(['select count(*)::int as n from seguros', 'tarificacion_trabajos'].join('.'))
  const oks = t.indexOf('await leerOrigenesVehiculo(prisma, correduriaId, w.oportunidad_id)')
  assert.ok(vivos > 0 && oks > vivos, 'orden: contar vivos → leer ok')
  const cancelar = t.slice(t.indexOf("set estado = 'cancelado'"))
  assert.match(cancelar, /and jsonb_typeof\(riesgo\) = 'object' and \(riesgo -> \$\{CLAVE_ESPERA_VEHICULO\}::text\) is not null`/)
})

// ─── Fase 4: liberar las esperas de Mapfre/Allianz (19/10/2026) ───
test('solo Mapfre/Allianz AUTO se pueden liberar; Generali no (no busca por matrícula)', () => {
  assert.equal(esperaLiberable('mapfre', 'auto'), true)
  assert.equal(esperaLiberable(' Allianz ', 'auto'), true)
  assert.equal(esperaLiberable('generali', 'auto'), false)
  assert.equal(esperaLiberable('mapfre', 'hogar'), false)
})

test('espera de Mapfre/Allianz: sin identificación en curso, con el origen bloqueado o pasadas 2 h → LIBERAR (nunca cancelar ni congelar)', () => {
  const t0 = new Date('2026-10-19T10:00:00Z')
  const luego = (ms: number) => new Date(t0.getTime() + ms)
  for (const compania of ['mapfre', 'allianz']) {
    const b = { vehiculo: null, creadoAt: t0, compania, ramo: 'auto' }
    assert.deepEqual(decidirEspera({ ...b, origenesVivos: 1, ahora: luego(60_000) }), { tipo: 'esperar' })
    assert.deepEqual(decidirEspera({ ...b, origenesVivos: 0, ahora: luego(60_000) }), { tipo: 'liberar', motivo: MOTIVO_LIBERADO_SIN_ORIGEN })
    assert.deepEqual(decidirEspera({ ...b, origenesVivos: 1, origenBloqueado: true, ahora: luego(60_000) }), { tipo: 'liberar', motivo: MOTIVO_LIBERADO_ORIGEN_BLOQUEADO })
    assert.deepEqual(decidirEspera({ ...b, origenesVivos: 1, ahora: luego(ESPERA_MAXIMA_IDENTIFICACION_MS) }), { tipo: 'liberar', motivo: MOTIVO_LIBERADO_CADUCADO })
    assert.equal(decidirEspera({ ...b, origenesVivos: 1, ahora: luego(ESPERA_MAXIMA_IDENTIFICACION_MS - 1) }).tipo, 'esperar')
  }
  assert.ok(ESPERA_MAXIMA_IDENTIFICACION_MS < ESPERA_MAXIMA_VEHICULO_MS)
})

test('espera liberable con vehículo disponible → INYECTAR (aunque el origen esté bloqueado o haya caducado)', () => {
  const t0 = new Date('2026-10-19T10:00:00Z')
  const d = decidirEspera({ vehiculo: { vehiculoConfirmado: VC as never }, origenesVivos: 0, creadoAt: t0, ahora: new Date(t0.getTime() + 9 * 3_600_000), compania: 'mapfre', ramo: 'auto', origenBloqueado: true })
  assert.equal(d.tipo, 'inyectar')
})

test('Generali conserva su regla: nunca se libera (ni con el origen bloqueado); cancela sin origen o a las 24 h', () => {
  const t0 = new Date('2026-10-19T10:00:00Z')
  const luego = (ms: number) => new Date(t0.getTime() + ms)
  const b = { vehiculo: null, creadoAt: t0, compania: 'generali', ramo: 'auto', origenBloqueado: true }
  assert.deepEqual(decidirEspera({ ...b, origenesVivos: 1, ahora: luego(3 * 3_600_000) }), { tipo: 'esperar' })
  assert.deepEqual(decidirEspera({ ...b, origenesVivos: 0, ahora: luego(60_000) }), { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_SIN_ORIGEN })
  assert.deepEqual(decidirEspera({ ...b, origenesVivos: 1, ahora: luego(ESPERA_MAXIMA_VEHICULO_MS) }), { tipo: 'cancelar', motivo: MOTIVO_CANCELADO_CADUCADO })
})
