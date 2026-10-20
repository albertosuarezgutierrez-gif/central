// La huella de la comparativa decide si el resumen guardado se REUTILIZA (mismas ofertas y cifras) o se redacta
// de nuevo. Para verlo en rojo: en `huellaComparativa` (comparativa-huella.ts), quita `recomendadaId` del `extra` → falla el segundo test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { OfertaNormalizada } from '@central/module-seguros'
import { huellaComparativa, narrativaDeEstudio } from './comparativa-huella.ts'

const O: OfertaNormalizada[] = [
  { id: 'a', rol: 'actual', compania: 'A', producto: null, primaTotal: 500, primaNeta: null, garantias: {} },
  { id: 'b', rol: 'oferta', compania: 'B', producto: null, primaTotal: 420, primaNeta: null, garantias: { lunas: { estado: 'incluida', capital: null, limite: null, franquicia: null } } },
]

test('misma entrada en otro orden → misma huella (sha256 hex)', () => {
  const h = huellaComparativa({ ramo: 'auto', ofertas: O })
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.equal(huellaComparativa({ ramo: 'auto', ofertas: [...O].reverse() }), h)
})

test('cambiar la recomendada, una prima o la superficie cambia la huella', () => {
  const h = huellaComparativa({ ramo: 'auto', ofertas: O })
  assert.notEqual(huellaComparativa({ ramo: 'auto', ofertas: O, recomendadaId: 'b' }), h)
  assert.notEqual(huellaComparativa({ ramo: 'auto', ofertas: O.map((o) => (o.id === 'b' ? { ...o, primaTotal: 421 } : o)) }), h)
  assert.notEqual(huellaComparativa({ ramo: 'auto', ofertas: O, superficieM2: 90 }), h)
})

test('narrativa guardada: solo una con forma válida', () => {
  assert.deepEqual(narrativaDeEstudio({ narrativa: { resumen: 'r', recomendacion: 'c', fuente: 'ia', descartada: null } }), { resumen: 'r', recomendacion: 'c', fuente: 'ia', descartada: null })
  assert.equal(narrativaDeEstudio({ narrativa: { resumen: 'r', recomendacion: 'c', fuente: 'otra' } }), null)
  assert.equal(narrativaDeEstudio(null), null)
})

test('solo se hereda un resumen de IA; uno de plantilla obliga a reintentar la IA', async () => {
  // Para verlo en rojo: en `narrativaReutilizable`, devuelve `!!n`.
  const { narrativaReutilizable } = await import('./comparativa-huella.ts')
  assert.equal(narrativaReutilizable({ resumen: 'r', recomendacion: 'c', fuente: 'ia', descartada: null }), true)
  assert.equal(narrativaReutilizable({ resumen: 'r', recomendacion: 'c', fuente: 'determinista', descartada: 'tope' }), false)
  assert.equal(narrativaReutilizable(null), false)
})
