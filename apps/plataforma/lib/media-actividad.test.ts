import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mediaMensualMesesCompletos, mediaMensualOSinDato, proyectarNetoActividad } from './media-actividad.ts'

const diez = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)

test('1 mes de ingreso en 10 transcurridos proyecta ingreso/10 por mes', () => {
  const ing = { '2026-05': 1981.13 }
  assert.equal(mediaMensualMesesCompletos(ing, diez), 198.113)
  const neto = proyectarNetoActividad(ing, {}, diez, 2)
  assert.ok(Math.abs((neto as number) - 396.226) < 1e-9)
})

test('sin ingresos en meses completos la media es 0', () => {
  assert.equal(mediaMensualMesesCompletos({}, diez), 0)
  assert.equal(proyectarNetoActividad({}, {}, diez, 2), null) // sin dato alguno: no se sabe
  assert.equal(proyectarNetoActividad({ '2026-03': 0 }, {}, diez, 2), 0)
})

test('sin meses completos no se sabe', () => {
  assert.equal(mediaMensualMesesCompletos({ '2026-01': 5 }, []), null)
})

test('ingresos ignoran meses no completos', () => {
  assert.equal(mediaMensualMesesCompletos({ '2026-11': 999 }, diez), 0)
})

test('mediaMensualOSinDato: un mes suelto no es ritmo mensual; sin entradas es null', () => {
  assert.equal(mediaMensualOSinDato({ '2026-05': 1000 }, diez), 100)
  assert.equal(mediaMensualOSinDato({}, diez), null)
})
