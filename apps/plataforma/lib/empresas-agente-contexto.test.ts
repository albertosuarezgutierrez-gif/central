// Tests del contexto (puro) del agente de empresas. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirContexto } from './empresas-agente-contexto.ts'

test('construirContexto lista empresas y provincias reales', () => {
  const ctx = construirContexto(
    {
      empresas: [
        { empresa: 'CALZADOS PASOLI SL', provincia: 'ALICANTE', score: 70, motivo: 'concurso de acreedores' },
        { empresa: 'SWIPE LEVANTE SL', provincia: 'ALICANTE', score: 45, motivo: 'disolución/extinción' },
      ],
      radar: [{ clave: 'ALICANTE', concursos: 1, disoluciones: 1 }],
      total: 2,
      provincias: ['ALICANTE'],
    },
    300,
  )
  assert.match(ctx, /CALZADOS PASOLI SL/)
  assert.match(ctx, /ALICANTE/)
  assert.match(ctx, /70/)
})

test('construirContexto respeta el tope de empresas', () => {
  const empresas = Array.from({ length: 500 }, (_, i) => ({ empresa: `E${i} SL`, empresaNorm: `E${i}`, provincia: 'X', score: 10, motivo: 'x' }))
  const ctx = construirContexto({ empresas, radar: [], total: 500, provincias: ['X'] }, 100)
  assert.ok((ctx.match(/ SL/g) || []).length <= 100)
})
