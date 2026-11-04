import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularPresupuesto, importeManoObraCent, importeGranelCent, cuotaIvaCent, validarConfig } from '../src/index.ts'
import { configPrueba } from './_config.ts'

const ok = (r: ReturnType<typeof calcularPresupuesto>) => {
  if (!r.ok) assert.fail(`esperaba ok: ${r.errores.join('; ')}`)
  return r.presupuesto
}

test('la config de prueba es válida', () => assert.deepEqual(validarConfig(configPrueba()), []))

test('importes enteros: mano de obra, granel, cuota', () => {
  assert.equal(importeManoObraCent(45, 4800, 0), 3600)
  assert.equal(importeManoObraCent(20, 4800, 2500), 2000) // 1600 × 1,25
  assert.equal(importeManoObraCent(7, 4800, 0), 560)
  assert.equal(importeManoObraCent(1, 4777, 0), 80) // 79,62 → 80
  assert.equal(importeGranelCent(4300, 899), 3866) // 4,3 l × 8,99 = 38,657 → 38,66
  assert.equal(cuotaIvaCent(3866, 1900), 735) // 734,54 → 735
})

test('paquete en turismo: precio CERRADO por tipo + pieza + aceite × litros, IVA por línea', () => {
  const p = ok(calcularPresupuesto(configPrueba(), {
    tipoVehiculo: 'turismo',
    lineas: [{ tipo: 'paquete', paqueteCodigo: 'aceite', aceiteCodigo: 'esp', litrosMl: 4300 }],
  }))
  assert.equal(p.lineas.length, 3)
  const [mo, filtro, aceite] = p.lineas
  assert.equal(mo.baseCent, 3000)
  assert.equal(mo.precioCerrado, true)
  assert.equal(mo.baremoMinutos, 45)
  assert.equal(mo.cuotaIvaCent, 570)
  assert.equal(filtro.baseCent, 1250)
  assert.equal(filtro.cuotaIvaCent, 238) // 237,5 → 238
  assert.equal(aceite.baseCent, 6343) // 4,3 × 14,75 = 63,425 → 63,43
  assert.equal(aceite.ivaCodigo, 'r') // IVA propio del aceite
  assert.equal(aceite.cuotaIvaCent, 317) // 317,15 → 317
  assert.equal(p.baseCent, 3000 + 1250 + 6343)
  assert.equal(p.cuotaIvaCent, 570 + 238 + 317)
  assert.equal(p.totalCent, p.baseCent + p.cuotaIvaCent)
  assert.deepEqual(p.desgloseIva.map((d) => [d.ivaCodigo, d.baseCent, d.cuotaCent]), [['g', 4250, 808], ['r', 6343, 317]])
})

test('mismo paquete en furgoneta: sin precio cerrado → baremo × hora × recargo del tipo', () => {
  const p = ok(calcularPresupuesto(configPrueba(), {
    tipoVehiculo: 'furgoneta',
    lineas: [{ tipo: 'paquete', paqueteCodigo: 'aceite', aceiteCodigo: 'gen', litrosMl: 6000 }],
  }))
  assert.equal(p.lineas[0].precioCerrado, false)
  assert.equal(p.lineas[0].baseCent, 4500) // 45 min × 48 €/h = 36 € × 1,25
  assert.equal(p.lineas[2].baseCent, 5394) // 6 l × 8,99
})

test('cambiar el precio hora en la config cambia el presupuesto (nada literal)', () => {
  const c = configPrueba()
  c.precioHoraCent = 6000
  const p = ok(calcularPresupuesto(c, { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'filtros' }] }))
  assert.equal(p.lineas[0].baseCent, 2000) // 20 min × 60 €/h
})

test('líneas manuales: mano de obra, pieza, granel y otro', () => {
  const p = ok(calcularPresupuesto(configPrueba(), {
    tipoVehiculo: 'turismo',
    lineas: [
      { tipo: 'mano_obra', descripcion: 'Diagnosis', minutos: 30 },
      { tipo: 'pieza', descripcion: 'Escobilla', referencia: 'BOSCH-1', cantidad: 2, precioUnitarioCent: 999 },
      { tipo: 'granel', aceiteCodigo: 'gen', litrosMl: 500 },
      { tipo: 'otro', descripcion: 'Residuos', cantidad: 1, precioUnitarioCent: 300, ivaCodigo: 'r' },
    ],
  }))
  assert.deepEqual(p.lineas.map((l) => l.baseCent), [2400, 1998, 450, 300])
  assert.equal(p.lineas[1].referencia, 'BOSCH-1')
  assert.equal(p.lineas[3].cuotaIvaCent, 15)
})

test('null ≠ 0: sin litros, sin aceite o sin tipo de vehículo NO se calcula', () => {
  const c = configPrueba()
  const sinLitros = calcularPresupuesto(c, { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'aceite', aceiteCodigo: 'gen', litrosMl: null }] })
  assert.equal(sinLitros.ok, false)
  if (!sinLitros.ok) assert.match(sinLitros.errores.join(), /litros/)

  const sinAceite = calcularPresupuesto(c, { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'aceite', litrosMl: 4000 }] })
  assert.equal(sinAceite.ok, false)

  const sinTipo = calcularPresupuesto(c, { tipoVehiculo: null, lineas: [{ tipo: 'paquete', paqueteCodigo: 'filtros' }] })
  assert.equal(sinTipo.ok, false)
  const sinTipoMo = calcularPresupuesto(c, { tipoVehiculo: null, lineas: [{ tipo: 'mano_obra', descripcion: 'x', minutos: 10 }] })
  assert.equal(sinTipoMo.ok, false)
})

test('errores de catálogo: paquete, aceite, tipo inactivo, IVA inexistente, cantidades', () => {
  const c = configPrueba()
  const casos = [
    { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete' as const, paqueteCodigo: 'nope' }] },
    { tipoVehiculo: 'turismo', lineas: [{ tipo: 'granel' as const, aceiteCodigo: 'nope', litrosMl: 100 }] },
    { tipoVehiculo: 'baja', lineas: [{ tipo: 'paquete' as const, paqueteCodigo: 'filtros' }] },
    { tipoVehiculo: 'turismo', lineas: [{ tipo: 'otro' as const, descripcion: 'x', cantidad: 1, precioUnitarioCent: 1, ivaCodigo: 'nope' }] },
    { tipoVehiculo: 'turismo', lineas: [{ tipo: 'pieza' as const, descripcion: 'x', cantidad: 1.5, precioUnitarioCent: 1 }] },
    { tipoVehiculo: 'turismo', lineas: [{ tipo: 'pieza' as const, descripcion: 'x', cantidad: 1, precioUnitarioCent: 9.99 }] },
    { tipoVehiculo: 'turismo', lineas: [] },
  ]
  for (const e of casos) assert.equal(calcularPresupuesto(c, e).ok, false, JSON.stringify(e))
})

test('presupuesto con la config de ALTA y sin paquetes: error, no precio inventado', async () => {
  const { configDeAlta } = await import('../src/index.ts')
  const r = calcularPresupuesto(configDeAlta(), { tipoVehiculo: 'turismo', lineas: [{ tipo: 'paquete', paqueteCodigo: 'aceite' }] })
  assert.equal(r.ok, false)
})
