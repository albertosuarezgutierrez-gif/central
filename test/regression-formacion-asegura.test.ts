// Cepos de la formación continua IDD en plataforma: una respuesta a medias no se pinta, el contador
// no inventa un 0, y la lista de estados no diverge del módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ESTADOS_FORMACION, contadorFormacion, interpretarFormacion } from '../apps/plataforma/lib/formacion-asegura.ts'

const ok = {
  estado: 'ok',
  cursos: [{ id: 'a', persona: 'Ana', curso: 'IDD', entidad: null, fecha: '2026-03-01', horas: 5, documentoId: null, creadaPor: 'x' }],
  resumen: { año: 2026, minimo: 15, pendientes: 1, personas: [{ persona: 'Ana', horas: 5, faltan: 10, estado: 'atrasado' }] },
}

test('lee una respuesta buena y cuenta los pendientes', () => {
  const l = interpretarFormacion(200, ok)
  assert.equal(l.estado, 'ok')
  assert.equal(contadorFormacion(l), 1)
})

test('🪤 una persona con un estado desconocido tumba la lectura (no se pinta a medias)', () => {
  const roto = { ...ok, resumen: { ...ok.resumen, personas: [{ persona: 'Ana', horas: 5, faltan: 10, estado: 'raro' }] } }
  assert.deepEqual(interpretarFormacion(200, roto), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('🪤 un fallo de lectura da contador null, nunca 0', () => {
  assert.equal(contadorFormacion(interpretarFormacion(500, { estado: 'error', causa: 'conexion' })), null)
  assert.equal(interpretarFormacion(404, null).estado, 'no_desplegado')
})

test('🪤 los estados de plataforma son los del módulo', () => {
  const src = readFileSync(new URL('../packages/module-seguros/src/formacion.ts', import.meta.url), 'utf8')
  const delModulo = [...src.matchAll(/^\s*\| '([a-z_]+)'/gm)].map((m) => m[1])
  assert.deepEqual([...delModulo].sort(), [...ESTADOS_FORMACION].sort())
})

test('🪤 la fecha de baja se lee; ausente (asegura anterior) es null; con forma rara tumba la lectura', () => {
  const conBaja = { ...ok, resumen: { ...ok.resumen, personas: [{ persona: 'Ana', horas: 5, faltan: 0, estado: 'baja', bajaDesde: '2026-05-01' }] } }
  const l = interpretarFormacion(200, conBaja)
  assert.ok(l.estado === 'ok' && l.resumen.personas[0].bajaDesde === '2026-05-01')
  const vieja = interpretarFormacion(200, ok)
  assert.ok(vieja.estado === 'ok' && vieja.resumen.personas[0].bajaDesde === null)
  const rara = { ...ok, resumen: { ...ok.resumen, personas: [{ persona: 'Ana', horas: 5, faltan: 10, estado: 'atrasado', bajaDesde: 'mayo' }] } }
  assert.deepEqual(interpretarFormacion(200, rara), { estado: 'error', motivo: 'respuesta_ilegible' })
})
