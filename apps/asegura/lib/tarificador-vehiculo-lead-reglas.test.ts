// Cepos del enganche «lead de coche → consulta de vehículo por bot» (idea 4). Matrículas y vehículos FICTICIOS. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { consultaCaducada, decidirConsultaLead, valorDesdeResultado } from './tarificador-vehiculo-lead-reglas.ts'

const OK = { estado: 'ok' as const, vehiculo: { marca: 'MARCA X', modelo: 'MODELO Y', version: '1.0 95CV', fechaMatriculacion: '2019-05-10', combustible: null } }
const base = { tipo: 'auto', abierta: true }

test('decidir: auto abierto con matrícula y sin ficha → consultar (matrícula normalizada)', () => {
  assert.deepEqual(decidirConsultaLead({ ...base, info: { matricula: '0000-bcd' } }), { accion: 'consultar', matricula: '0000BCD' })
  assert.deepEqual(decidirConsultaLead({ ...base, info: { datosVehiculo: { matricula: '0000 BCD' } } }), { accion: 'consultar', matricula: '0000BCD' })
})

test('decidir: omite moto/hogar, cerrada, sin matrícula o inválida', () => {
  assert.equal(decidirConsultaLead({ tipo: 'moto', abierta: true, info: { matricula: '0000BCD' } }).accion, 'omitir')
  assert.equal(decidirConsultaLead({ ...base, abierta: false, info: { matricula: '0000BCD' } }).accion, 'omitir')
  assert.equal(decidirConsultaLead({ ...base, info: {} }).accion, 'omitir')
  assert.equal(decidirConsultaLead({ ...base, info: null }).accion, 'omitir')
  assert.equal(decidirConsultaLead({ ...base, info: { matricula: 'hola' } }).accion, 'omitir')
})

test('decidir: el dato humano gana (marca, modelo, código, texto antiguo o confirmada) y no se repite', () => {
  const m = '0000BCD'
  for (const info of [
    { matricula: m, datosVehiculo: { marca: 'SEAT' } },
    { matricula: m, datosVehiculo: { modelo: 'IBIZA' } },
    { matricula: m, datosVehiculo: { codigoVehiculo: '123' } },
    { matricula: m, datosVehiculo: { confirmadoAt: '2026-11-01T10:00:00Z' } },
    { matricula: m, vehiculo: 'SEAT Ibiza 1.0' },
    { matricula: m, marca: 'SEAT' },
    { matricula: m, vehiculoConsulta: { estado: 'caducada', at: '2026-11-01T10:00:00Z' } },
  ]) assert.equal(decidirConsultaLead({ ...base, info }).accion, 'omitir', JSON.stringify(info))
})

test('valorDesdeResultado: ficha libre → marca+modelo+huecos; nunca confirma', () => {
  const v = valorDesdeResultado({ matricula: '0000BCD' }, OK)
  assert.deepEqual(v, { marca: 'MARCA X', modelo: 'MODELO Y', version: '1.0 95CV', fechaMatriculacion: '2019-05-10' })
  assert.ok(!v || !('confirmadoAt' in v))
})

test('valorDesdeResultado: respeta lo que ya hay (fecha puesta por una persona) y sin_resultado no escribe', () => {
  const v = valorDesdeResultado({ datosVehiculo: { matricula: '0000BCD', fechaMatriculacion: '2020-01-01' } }, OK)
  assert.equal(v?.fechaMatriculacion, undefined)
  assert.equal(v?.marca, 'MARCA X')
  assert.equal(valorDesdeResultado({ matricula: '0000BCD' }, { estado: 'sin_resultado' }), null)
})

test('valorDesdeResultado: ficha ocupada o confirmada → null (no se pisa)', () => {
  assert.equal(valorDesdeResultado({ datosVehiculo: { marca: 'SEAT' } }, OK), null)
  assert.equal(valorDesdeResultado({ datosVehiculo: { confirmadoAt: '2026-11-01T10:00:00Z' } }, OK), null)
  assert.equal(valorDesdeResultado({ datosVehiculo: { codigoVehiculo: '9' } }, OK), null)
})

test('consultaCaducada: más de 24 h, o fecha ilegible', () => {
  const ahora = new Date('2026-11-07T12:00:00Z')
  assert.equal(consultaCaducada({ estado: 'encolada', at: '2026-11-07T00:00:00Z' }, ahora), false)
  assert.equal(consultaCaducada({ estado: 'encolada', at: '2026-11-05T00:00:00Z' }, ahora), true)
  assert.equal(consultaCaducada({ estado: 'encolada', at: 'x' }, ahora), true)
})

test('cableado: el barrido llama al enganche y éste exige los DOS interruptores y marca antes de encolar', () => {
  const lib = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
  assert.match(lib('tarificador.ts'), /engancharVehiculosDeLeads\(correduriaId, deps\.env\)/)
  const bd = lib('tarificador-vehiculo-lead.ts')
  assert.match(bd, /!rpaActivo\(env\) \|\| !vehiculoActivo\(env\)/)
  assert.ok(bd.indexOf("ponerMarca(correduriaId, op.id, 'encolada', true)") < bd.indexOf('consultarOEncolarVehiculo({'))
})
