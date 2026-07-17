// Tests del radar de sectores. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarRadar } from './empresas-radar.ts'

test('cuenta por clave y clasifica cuadrante', () => {
  const filas = [
    { clave: 'Sevilla', tipo: 'concurso' },
    { clave: 'Sevilla', tipo: 'concurso' },
    { clave: 'Sevilla', tipo: 'ampliacion_capital' },
    { clave: 'Cádiz', tipo: 'cese' },
  ] as const
  const r = agregarRadar([...filas])
  const sev = r.find((x) => x.clave === 'Sevilla')!
  assert.equal(sev.concursos, 2)
  assert.ok(sev.dificultad > 0)
  assert.ok(['caza', 'declive', 'sano', 'ignorar'].includes(sev.cuadrante))
  const cad = r.find((x) => x.clave === 'Cádiz')!
  assert.equal(cad.dificultad, 0)
  assert.equal(cad.cuadrante, 'ignorar')
})
