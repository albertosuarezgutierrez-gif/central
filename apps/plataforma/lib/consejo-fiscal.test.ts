// Tests del consejo fiscal breve y determinista. Runner: `node --test lib/consejo-fiscal.test.ts`
// (type-stripping). Puro: sin Prisma ni red — solo aritmética + formato español.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { consejoFiscal, mesesHastaPagoRenta, type EntradaConsejo } from './consejo-fiscal.ts'

// Ejercicio 2026 mirado el 22/07/2026 (año vigente).
const HOY = new Date(Date.UTC(2026, 6, 22))

function entrada(resultadoTitular: number, resultadoConjunta: number, rec: 'conjunta' | 'separada'): EntradaConsejo {
  return {
    year: 2026,
    finAnio: {
      conjunta: { resultado: resultadoConjunta },
      separada: { titular: { resultado: resultadoTitular } },
      recomendacion: rec,
    },
  }
}

test('mesesHastaPagoRenta: julio 2026 → junio 2027 = 11 meses', () => {
  assert.equal(mesesHastaPagoRenta(2026, HOY), 11)
})

test('mesesHastaPagoRenta: nunca baja de 1 (fecha posterior al objetivo)', () => {
  assert.equal(mesesHastaPagoRenta(2026, new Date(Date.UTC(2027, 11, 1))), 1)
})

test('sale a pagar (año vigente) → titular en llano + acción de provisión mensual', () => {
  const c = consejoFiscal(entrada(3300, 3600, 'separada'), HOY)
  assert.equal(c.tono, 'pagar')
  assert.match(c.titular, /Vas camino de pagar 3\.300,00€/)
  assert.match(c.titular, /individual \(solo tú\)/)
  assert.equal(c.acciones.length, 1)
  // 3300 / 11 = 300 €/mes
  assert.match(c.acciones[0].texto, /300€\/mes/)
  assert.match(c.acciones[0].texto, /junio de 2027/)
})

test('modalidad conjunta recomendada → se usa el resultado de conjunta y su etiqueta', () => {
  const c = consejoFiscal(entrada(3300, 2200, 'conjunta'), HOY)
  assert.match(c.titular, /2\.200,00€/)
  assert.match(c.titular, /en conjunta con Pilar/)
})

test('sale a devolver → titular positivo y SIN acción de provisión', () => {
  const c = consejoFiscal(entrada(-800, -900, 'separada'), HOY)
  assert.equal(c.tono, 'devolver')
  assert.match(c.titular, /que te devuelvan 800,00€/)
  assert.equal(c.acciones.length, 0)
})

test('a pagar pero importe pequeño (< umbral) → titular sin acción de provisión', () => {
  const c = consejoFiscal(entrada(120, 120, 'separada'), HOY)
  assert.equal(c.tono, 'pagar')
  assert.equal(c.acciones.length, 0)
})

test('año ya cerrado (mirado en 2027) → redacción en pasado y sin provisión', () => {
  const c = consejoFiscal(entrada(3300, 3600, 'separada'), new Date(Date.UTC(2027, 3, 1)))
  assert.match(c.titular, /te sale a pagar/)
  assert.equal(c.acciones.length, 0)
})
