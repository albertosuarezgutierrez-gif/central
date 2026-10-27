// «Probar» Generali auto: el vehículo confirmado por el último `ok` de Allianz/Mapfre del cliente se toma SOLO de la lista
// blanca (seleccionVehiculo vía vehiculoCatalogo, vehiculoConfirmado). `node --test`. Datos FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decidirRiesgoProbar, conVehiculoDeOrigen, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'
import { riesgoAlEncolar, MOTIVO_SIN_OPORTUNIDAD, type FilaOrigen } from './tarificador-espera-vehiculo.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'

const VC = { origen: 'mapfre', denominacion: 'SEAT IBIZA 1.0 TSI STYLE', cv: 95, cc: 999, puertas: 5, fechaInicio: '2017-06-01' }
const CAT = { origen: 'allianz', marca: 'SEAT', modelo: 'IBIZA', descripcion: '1.0 TSI STYLE' }
const coche = () => ({
  ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: false,
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
})
const rec = (riesgo: unknown): ReconstruccionRiesgo => ({ riesgo, bloqueos: [], repreguntar: [] })
const fila = (riesgo: unknown, compania = 'allianz'): FilaOrigen => ({ compania, ramo: 'auto', riesgo, terminadoAt: new Date('2026-10-20T10:00:00Z') })
const probar = (filas: FilaOrigen[]) =>
  decidirRiesgoProbar({
    reconstruccion: conVehiculoDeOrigen(rec(coche()), 'generali', 'auto', filas),
    previo: null, soloPurgados: false, validar: (riesgo) => validarEntradaRamo('auto', riesgo, 'generali'),
  })

test('ok de Mapfre con vehiculoConfirmado → se rellena y el riesgo valida', () => {
  const d = probar([fila({ vehiculoConfirmado: VC }, 'mapfre')])
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    const r = d.entrada.riesgo as Record<string, unknown>
    assert.equal((r.vehiculoConfirmado as Record<string, unknown>).denominacion, VC.denominacion)
    // con el vehículo, el encolado ya no devuelve el 422 de «sin oportunidad»
    assert.equal(riesgoAlEncolar(r, null, null).ok, true)
  }
})
test('vehiculoCatalogo de Mapfre/Allianz → seleccionVehiculo (sin el origen)', () => {
  const d = probar([fila({ vehiculoCatalogo: CAT })])
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    const sv = (d.entrada.riesgo as Record<string, unknown>).seleccionVehiculo as Record<string, unknown>
    assert.deepEqual([sv.marca, sv.modelo, sv.descripcion, sv.origen], ['SEAT', 'IBIZA', '1.0 TSI STYLE', undefined])
  }
})
test('sin ok de origen → no se toca el riesgo y el encolado sigue dando el 422 generali_sin_vehiculo', () => {
  const r = rec(coche())
  assert.equal(conVehiculoDeOrigen(r, 'generali', 'auto', []), r)
  const e = riesgoAlEncolar(coche(), null, null)
  assert.ok(!e.ok && e.status === 422 && e.motivo === MOTIVO_SIN_OPORTUNIDAD)
})
test('claves personales del riesgo de origen nunca se copian (solo la lista blanca de vehículo)', () => {
  const sucio = { vehiculoConfirmado: VC, vehiculoCatalogo: CAT, matricula: '9999ZZZ', conductor: { sexo: 'hombre' }, documentoTomador: '11111111H', datosTomador: { nombre: 'X' }, seleccionVehiculo: { marca: 'TECLEADA', modelo: 'X' }, eleccionVersion: 'v1' }
  const out = conVehiculoDeOrigen(rec(coche()), 'generali', 'auto', [fila(sucio)])
  const r = out.riesgo as Record<string, unknown>
  assert.equal(r.matricula, '1234BCD')
  assert.equal((r.conductor as Record<string, unknown>).sexo, 'mujer')
  assert.equal(r.documentoTomador, '00000000T')
  assert.equal((r.datosTomador as Record<string, unknown>).nombre, 'NOMBRE')
  assert.equal((r.seleccionVehiculo as Record<string, unknown>).marca, 'SEAT') // el catálogo del bot, no el tecleado
  assert.equal(r.eleccionVersion, undefined)
})
test('solo Generali auto, y no pisa un vehículo que el riesgo ya trae', () => {
  const r = rec(coche())
  assert.equal(conVehiculoDeOrigen(r, 'allianz', 'auto', [fila({ vehiculoConfirmado: VC })]), r)
  assert.equal(conVehiculoDeOrigen(r, 'generali', 'moto', [fila({ vehiculoConfirmado: VC })]), r)
  const ya = rec({ ...coche(), seleccionVehiculo: { marca: 'FORD', modelo: 'FOCUS' } })
  assert.equal(conVehiculoDeOrigen(ya, 'generali', 'auto', [fila({ vehiculoConfirmado: VC })]), ya)
  assert.equal(conVehiculoDeOrigen({ riesgo: null, motivo: 'sin_oportunidad' }, 'generali', 'auto', [fila({ vehiculoConfirmado: VC })]).riesgo, null)
  assert.equal(conVehiculoDeOrigen(r, 'generali', 'auto', [fila({ vehiculoConfirmado: VC }, 'generali')]), r)
})
test('cableado: la ruta lee los ok del CLIENTE y aplica el vehículo ANTES de decidir', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', 'app/api/operador/tarificador/probar/route.ts'), 'utf8')
  assert.match(ruta, /leerOrigenesVehiculoCliente\(/)
  assert.ok(ruta.indexOf('conVehiculoDeOrigen(') < ruta.indexOf('decidirRiesgoProbar('))
})
