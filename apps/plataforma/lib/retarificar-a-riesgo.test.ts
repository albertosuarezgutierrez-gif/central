// Cepo de «Tarificar con bots (gratis)» en Retarificar (28/10/2026): decisión pura de qué se guarda en el riesgo
// (info_riesgo.datosVehiculo) sin pagar Avant2, y a dónde se va después.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  datosVehiculoDeRetarificar, idOportunidadAbierta, urlBotsGratis, TEXTO_BOTS_GRATIS, TEXTO_AVANT2,
} from './retarificar-a-riesgo.ts'

const lista = (id: string, nombre: string) => [{ id, nombre }]
const base = {
  ramo: 'auto' as string | null,
  marcas: lista('7', 'SEAT'), modelos: lista('70', 'Ibiza'), versiones: lista('B7-1', '1.0 TSI 95cv'),
  marcaId: '7', modeloId: '70', motorId: 'Gasoline', codigoVehiculo: 'B7-1', garaje: '', fechaMatriculacion: '',
}

test('cascada completa → los 7 campos del catálogo juntos', () => {
  const r = datosVehiculoDeRetarificar(base)
  assert.deepEqual(r, { ok: true, datos: { marca: 'SEAT', modelo: 'Ibiza', version: '1.0 TSI 95cv', codigoVehiculo: 'B7-1', marcaId: '7', modeloId: '70', motorId: 'Gasoline' } })
})

test('versión recuperada sin cascada → solo el código; marca/modelo no se inventan', () => {
  const r = datosVehiculoDeRetarificar({ ...base, marcas: [], modelos: [], versiones: [], marcaId: '', modeloId: '', motorId: '' })
  assert.deepEqual(r, { ok: true, datos: { codigoVehiculo: 'B7-1' } })
})

test('sin versión → no se guarda nada y se dice por qué', () => {
  const r = datosVehiculoDeRetarificar({ ...base, codigoVehiculo: '' })
  assert.equal(r.ok, false)
})

test('garaje y matriculación solo viajan si están y son válidos; vacío = ausente (no null)', () => {
  const a = datosVehiculoDeRetarificar({ ...base, garaje: '3', fechaMatriculacion: '2019-05-17' })
  assert.ok(a.ok && a.datos.garaje === '3' && a.datos.fechaMatriculacion === '2019-05-17')
  const b = datosVehiculoDeRetarificar({ ...base, garaje: '  ', fechaMatriculacion: '31/02/2019' })
  assert.ok(b.ok && !('garaje' in b.datos) && !('fechaMatriculacion' in b.datos))
  const c = datosVehiculoDeRetarificar({ ...base, fechaMatriculacion: '2019-02-31' })
  assert.ok(c.ok && !('fechaMatriculacion' in c.datos))
})

test('ramos sin catálogo de vehículo (hogar, null) → no_aplica, no se escribe datosVehiculo', () => {
  assert.deepEqual(datosVehiculoDeRetarificar({ ...base, ramo: 'hogar' }), { ok: false, motivo: 'no_aplica' })
  assert.deepEqual(datosVehiculoDeRetarificar({ ...base, ramo: null }), { ok: false, motivo: 'no_aplica' })
})

test('moto también (catálogo propio)', () => {
  assert.equal(datosVehiculoDeRetarificar({ ...base, ramo: 'moto' }).ok, true)
})

test('idOportunidadAbierta: solo con estado ok y uuid; nunca un id inventado', () => {
  const U = '123e4567-e89b-42d3-a456-426614174000'
  assert.equal(idOportunidadAbierta(200, { estado: 'ok', oportunidadId: U }), U)
  assert.equal(idOportunidadAbierta(200, { estado: 'ok', oportunidadId: 'x' }), null)
  assert.equal(idOportunidadAbierta(500, { estado: 'ok', oportunidadId: U }), null)
  assert.equal(idOportunidadAbierta(200, null), null)
  assert.equal(idOportunidadAbierta(200, { estado: 'error' }), null)
})

test('urlBotsGratis lleva al ancla del bloque de bots de la oportunidad', () => {
  assert.equal(urlBotsGratis('abc'), '/correduria/oportunidad/abc#bots-gratis')
})

test('los dos textos dicen la verdad del coste (0,50€ vs gratis)', () => {
  assert.match(TEXTO_BOTS_GRATIS, /gratis/i)
  assert.match(TEXTO_AVANT2, /0,50€/)
})

test('cableado: el componente nunca llama a la acción que cuesta, y los dos Retarificadores lo montan', () => {
  const dir = new URL('../app/(usuario)/correduria/poliza/[id]/retarificar/', import.meta.url)
  const c = readFileSync(new URL('TarificarConBots.tsx', dir), 'utf8')
  assert.doesNotMatch(c, /pedirCotizacion|retarificarAsegura|codeoscopic/i)
  assert.match(c, /\/api\/correduria\/oportunidad\/de-poliza/)
  for (const f of ['retarificador.tsx', 'RetarificadorHogar.tsx']) {
    assert.match(readFileSync(new URL(f, dir), 'utf8'), /<TarificarConBots/, f)
  }
})
