// Sellos de un ciclo (14/10/2026): un sello del vencimiento del año pasado no prueba nada sobre este.
import test from 'node:test'
import assert from 'node:assert/strict'
import { DIAS_VIGENCIA_SELLO, fechaAccionable, selloDeEsteCiclo, sellosAReiniciar } from './obligacion.ts'
import { DIAS_ANTELACION_MAX } from './preferencias-avisos.ts'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
// Vence el 15/03/2027 → accionable 13/02/2027.
const ACCIONABLE = fechaAccionable(d('2027-03-15'))
const HACE_12_MESES = new Date('2026-02-10T08:00:00Z')
const ESTE_CICLO = new Date('2027-02-06T08:00:00Z')

test('la vigencia del sello es la antelación máxima elegible + 1', () => {
  assert.equal(DIAS_VIGENCIA_SELLO, DIAS_ANTELACION_MAX + 1)
})

test('🚨 sello de hace 12 meses → se suelta (avisadaAt Y avisadaPushAt)', () => {
  assert.deepEqual(sellosAReiniciar({ avisadaAt: HACE_12_MESES, avisadaPushAt: HACE_12_MESES }, ACCIONABLE), { avisadaAt: null, avisadaPushAt: null })
})

test('🚨 sello de este ciclo → se conserva (reabrirlo repetiría el aviso)', () => {
  assert.deepEqual(sellosAReiniciar({ avisadaAt: ESTE_CICLO, avisadaPushAt: ESTE_CICLO }, ACCIONABLE), {})
})

test('mezcla: correo viejo y push de este ciclo → solo se suelta el viejo', () => {
  assert.deepEqual(sellosAReiniciar({ avisadaAt: HACE_12_MESES, avisadaPushAt: ESTE_CICLO }, ACCIONABLE), { avisadaAt: null })
})

test('sin sellos o fila nueva → nada que soltar', () => {
  assert.deepEqual(sellosAReiniciar({ avisadaAt: null, avisadaPushAt: null }, ACCIONABLE), {})
  assert.deepEqual(sellosAReiniciar(undefined, ACCIONABLE), {})
})

test('selloDeEsteCiclo: el borde es accionable − 31 días (incluido)', () => {
  const borde = new Date(ACCIONABLE.getTime() - 31 * 86_400_000)
  assert.equal(selloDeEsteCiclo(borde, ACCIONABLE), true)
  assert.equal(selloDeEsteCiclo(new Date(borde.getTime() - 1), ACCIONABLE), false)
  assert.equal(selloDeEsteCiclo(null, ACCIONABLE), false)
})
