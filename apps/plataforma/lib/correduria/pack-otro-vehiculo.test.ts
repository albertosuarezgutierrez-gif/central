import test from 'node:test'
import assert from 'node:assert/strict'
import { COSTE_LLAMADA_EUR, otroRamoPack, otroVehiculoDelCliente, planPackOtroVehiculo, textoCostePack } from './pack-otro-vehiculo.ts'
import type { DatosVehiculoRiesgo } from '@central/module-seguros'

const AHORA = new Date('2026-10-03T10:00:00Z')

const datos = (o: Partial<DatosVehiculoRiesgo> = {}): DatosVehiculoRiesgo => ({
  matricula: '1234ABC', marca: 'Marca', modelo: 'Modelo', version: 'V1', codigoVehiculo: '99001', marcaId: '1', modeloId: '2', motorId: 'Gasoline',
  fechaMatriculacion: '2025-05-01', fechaCompra: null, kmAnuales: null, garaje: '3', cpCirculacion: null, municipioCirculacion: null,
  municipioCirculacionId: null, remolqueLigero: null, tipoVehiculo: null, cilindradaCc: null, confirmadoAt: null, ...o,
})

const op = (o: Record<string, unknown> = {}) => ({ id: 'o1', ramo: 'moto', estado: 'competencia', matricula: '1234ABC', vehiculo: 'Moto de prueba', ...o })

test('el otro vehículo es el del otro ramo', () => {
  assert.equal(otroRamoPack('auto'), 'moto')
  assert.equal(otroRamoPack('moto'), 'auto')
})

test('otro vehículo: la ÚNICA abierta del otro ramo; con dos no se elige', () => {
  assert.deepEqual(otroVehiculoDelCliente([op(), op({ id: 'a', ramo: 'auto' })], 'auto'), { estado: 'uno', oportunidadId: 'o1', etiqueta: '1234ABC · Moto de prueba', ramo: 'moto' })
  assert.equal(otroVehiculoDelCliente([op(), op({ id: 'o2' })], 'auto').estado, 'ambiguo')
  assert.equal(otroVehiculoDelCliente([op({ estado: 'perdida' })], 'auto').estado, 'ninguno')
  assert.equal(otroVehiculoDelCliente([op({ ramo: 'hogar' })], 'auto').estado, 'ninguno')
})

test('plan: con todo conocido, resueltos del otro vehículo (coche: sin marca/motor del catálogo moto)', () => {
  const p = planPackOtroVehiculo({ ramo: 'auto', datos: datos(), fechaEfecto: '', ahora: AHORA })
  assert.equal(p.ok, true)
  assert.deepEqual(p.ok && p.resueltos, { codigoVehiculo: '99001', matricula: '1234ABC', fechaMatriculacion: '2025-05-01', garaje: '3' })
  const m = planPackOtroVehiculo({ ramo: 'moto', datos: datos(), fechaEfecto: '2026-10-20', ahora: AHORA })
  assert.equal(m.ok && m.resueltos.motor, 'Gasoline')
  assert.equal(m.ok && m.fechaEfecto, '2026-10-20')
})

test('plan: sin datos o con huecos NO se tarifica y se dice qué falta (no se adivina)', () => {
  assert.match((planPackOtroVehiculo({ ramo: 'moto', datos: null, fechaEfecto: '', ahora: AHORA }) as { motivo: string }).motivo, /no tiene datos del vehículo/)
  const r = planPackOtroVehiculo({ ramo: 'moto', datos: datos({ codigoVehiculo: null, matricula: null }), fechaEfecto: '', ahora: AHORA })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /la versión, la matrícula/)
  assert.match((planPackOtroVehiculo({ ramo: 'moto', datos: datos({ motorId: null }), fechaEfecto: '', ahora: AHORA }) as { motivo: string }).motivo, /marca, modelo y motor/)
  // En coche, marca/modelo/motor no hacen falta.
  assert.equal(planPackOtroVehiculo({ ramo: 'auto', datos: datos({ motorId: null, marcaId: null }), fechaEfecto: '', ahora: AHORA }).ok, true)
})

test('plan: la fecha de efecto máx. 90 días vista (y no anterior a hoy)', () => {
  assert.equal(planPackOtroVehiculo({ ramo: 'auto', datos: datos(), fechaEfecto: '2027-01-02', ahora: AHORA }).ok, false, 'día 91')
  assert.equal(planPackOtroVehiculo({ ramo: 'auto', datos: datos(), fechaEfecto: '2026-10-02', ahora: AHORA }).ok, false, 'ayer')
  assert.equal(planPackOtroVehiculo({ ramo: 'auto', datos: datos(), fechaEfecto: '2027-01-01', ahora: AHORA }).ok, true, 'el día 90 exacto cabe')
})

test('plan: matriculación prevista a más de 90 días → no cabe, se explica y no se tarifica', () => {
  const r = planPackOtroVehiculo({ ramo: 'auto', datos: datos({ fechaMatriculacion: '2027-03-01' }), fechaEfecto: '', ahora: AHORA })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /a más de 90 días vista/)
})

test('plan: matriculación posterior al efecto → no se tarifica', () => {
  const r = planPackOtroVehiculo({ ramo: 'auto', datos: datos({ fechaMatriculacion: '2026-12-01' }), fechaEfecto: '2026-10-20', ahora: AHORA })
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.motivo : '', /después de la fecha de efecto/)
  assert.equal(planPackOtroVehiculo({ ramo: 'auto', datos: datos({ fechaMatriculacion: '2026-12-01' }), fechaEfecto: '2026-12-02', ahora: AHORA }).ok, true)
})

test('coste: 0,50€ la llamada; el texto lo dice antes de lanzar', () => {
  assert.equal(COSTE_LLAMADA_EUR, 0.5)
  assert.match(textoCostePack(0), /0,50€ reales.*1,00€/)
  assert.match(textoCostePack(1), /0,50€ reales.*1,00€/)
})
