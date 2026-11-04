import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDeAlta, validarConfig } from '../src/index.ts'

test('la configuración de alta es válida', () => {
  assert.deepEqual(validarConfig(configDeAlta()), [])
})

test('configDeAlta devuelve un objeto nuevo cada vez (no se comparte entre talleres)', () => {
  const a = configDeAlta()
  const b = configDeAlta()
  a.precioHoraCent = 1
  a.ivas[0].puntosBasicos = 1
  assert.notEqual(b.precioHoraCent, 1)
  assert.notEqual(b.ivas[0].puntosBasicos, 1)
})

test('alta sin paquetes ni aceites: no se inventan precios', () => {
  const c = configDeAlta()
  assert.equal(c.paquetes.length, 0)
  assert.equal(c.aceites.length, 0)
  assert.ok(c.tiposVehiculo.every((t) => t.recargoPuntosBasicos === 0))
})

test('validarConfig detecta referencias rotas y valores inválidos', () => {
  const c = configDeAlta()
  c.precioHoraCent = 0
  c.ivaPorDefecto.pieza = 'inexistente'
  c.paquetes.push({
    codigo: 'p', nombre: 'P', baremoMinutos: 30, precioCerradoPorTipo: { camion: 100 },
    piezas: [], requiereAceite: false, activo: true,
  })
  c.series = c.series.map((s) => ({ ...s, porDefecto: false }))
  c.horarioCitas.franjas.push({ diaSemana: 7, desde: '14:00', hasta: '09:00' })
  const e = validarConfig(c)
  assert.ok(e.some((x) => x.includes('precioHoraCent')))
  assert.ok(e.some((x) => x.includes('ivaPorDefecto.pieza')))
  assert.ok(e.some((x) => x.includes('camion')))
  assert.ok(e.some((x) => x.includes('serie ordinaria')))
  assert.ok(e.some((x) => x.includes('día 7')))
  assert.ok(e.some((x) => x.includes('14:00-09:00')))
})
