// «Probar» Generali auto (31/10/2026): sin `ok` de Allianz/Mapfre, marca/modelo/versión de la póliza VIVA vinculada a la oportunidad
// (`datos_especificos`). Sin marca o modelo → null (sigue el 422 `generali_sin_vehiculo`). `node --test`. Datos FICTICIOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conVehiculoDeOrigen, conVehiculoDePoliza, decidirRiesgoProbar, type ReconstruccionRiesgo } from './tarificador-relanzar-reglas.ts'
import { riesgoAlEncolar, vehiculoDePolizaViva, MOTIVO_SIN_OPORTUNIDAD, type FilaOrigen } from './tarificador-espera-vehiculo.ts'
import { validarEntradaRamo } from './tarificador-reglas.ts'

const coche = () => ({
  ramo: 'auto', matricula: '0000XXX', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: false,
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
})
const rec = (riesgo: unknown): ReconstruccionRiesgo => ({ riesgo, bloqueos: [], repreguntar: [] })
const POLIZA = { marca: 'SEAT', modelo: 'IBIZA', version: '1.0 TSI STYLE' }

test('póliza viva con marca/modelo/versión → seleccionVehiculo y el riesgo de Generali VALIDA (ya no es generali_sin_vehiculo)', () => {
  const d = decidirRiesgoProbar({
    reconstruccion: conVehiculoDePoliza(rec(coche()), 'generali', 'auto', POLIZA),
    previo: null, soloPurgados: false, validar: (riesgo) => validarEntradaRamo('auto', riesgo, 'generali'),
  })
  assert.ok(d.ok, JSON.stringify(d))
  if (d.ok) {
    const r = d.entrada.riesgo as Record<string, unknown>
    const sv = r.seleccionVehiculo as Record<string, unknown>
    assert.deepEqual([sv.marca, sv.modelo, sv.descripcion], ['SEAT', 'IBIZA', '1.0 TSI STYLE'])
    assert.equal(riesgoAlEncolar(r, null, null).ok, true)
  }
})

test('sin inventar: falta marca o modelo, o no hay póliza → null y el riesgo intacto (sigue el 422)', () => {
  for (const d of [null, undefined, 'texto', {}, { marca: 'SEAT' }, { modelo: 'IBIZA', version: 'X' }, { marca: '  ', modelo: 'IBIZA' }, { marca: 'SEAT', modelo: null }]) {
    assert.equal(vehiculoDePolizaViva(d), null, JSON.stringify(d))
  }
  const r = rec(coche())
  assert.equal(conVehiculoDePoliza(r, 'generali', 'auto', { marca: 'SEAT' }), r)
  assert.equal(conVehiculoDePoliza(r, 'generali', 'auto', null), r)
  const e = riesgoAlEncolar(coche(), null, null)
  assert.ok(!e.ok && e.status === 422 && e.motivo === MOTIVO_SIN_OPORTUNIDAD)
})

test('sin versión (o versión inválida) → marca y modelo solos; nada fuera de las tres claves se copia', () => {
  assert.deepEqual(vehiculoDePolizaViva({ marca: 'SEAT', modelo: 'IBIZA', version: '' }), { seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
  assert.deepEqual(vehiculoDePolizaViva({ marca: 'SEAT', modelo: 'IBIZA', version: 'x'.repeat(500) }), { seleccionVehiculo: { marca: 'SEAT', modelo: 'IBIZA' } })
  const out = conVehiculoDePoliza(rec(coche()), 'generali', 'auto', { ...POLIZA, matricula: '9999ZZZ', bastidor: 'VF0000', iban: 'ES00' })
  const r = out.riesgo as Record<string, unknown>
  assert.equal(r.matricula, '0000XXX')
  assert.deepEqual(Object.keys(r.seleccionVehiculo as object).sort(), ['descripcion', 'marca', 'modelo'])
})

test('lo confirmado por un bot manda; otra compañía/ramo o riesgo con vehículo → mismo objeto', () => {
  const fila: FilaOrigen = { compania: 'allianz', ramo: 'auto', riesgo: { vehiculoCatalogo: { origen: 'allianz', marca: 'OPEL', modelo: 'CORSA' } }, terminadoAt: new Date() }
  const conBot = conVehiculoDeOrigen(rec(coche()), 'generali', 'auto', [fila])
  assert.equal(conVehiculoDePoliza(conBot, 'generali', 'auto', POLIZA), conBot)
  const r = rec(coche())
  assert.equal(conVehiculoDePoliza(r, 'mapfre', 'auto', POLIZA), r)
  assert.equal(conVehiculoDePoliza(r, 'generali', 'moto', POLIZA), r)
})

test('cableado: «probar» aplica la póliza DESPUÉS de los orígenes y el lector solo trae marca/modelo/versión de la póliza vinculada viva', () => {
  const ruta = readFileSync(join(import.meta.dirname, '../app/api/operador/tarificador/probar/route.ts'), 'utf8')
  const iOrigen = ruta.indexOf('conVehiculoDeOrigen(conCompania')
  const iPoliza = ruta.indexOf('conVehiculoDePoliza(conOrigen')
  assert.ok(iOrigen > 0 && iPoliza > iOrigen, 'póliza después de los orígenes')
  assert.match(ruta, /leerVehiculoPolizaVinculadaCliente\(correduria\.id, clienteId, ramo\)/)
  const lead = readFileSync(join(import.meta.dirname, 'tarificacion-lead.ts'), 'utf8')
  const f = lead.slice(lead.indexOf('export async function leerVehiculoPolizaVinculadaCliente'))
  const cuerpo = f.slice(0, f.indexOf('\n}\n'))
  assert.match(cuerpo, /jsonb_build_object\('marca', p\.datos_especificos->'marca', 'modelo', p\.datos_especificos->'modelo', 'version', p\.datos_especificos->'version'\)/)
  assert.match(cuerpo, /p\.estado::text = 'activa'/)
  assert.match(cuerpo, /p\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.doesNotMatch(cuerpo, /matricula|bastidor/)
})
