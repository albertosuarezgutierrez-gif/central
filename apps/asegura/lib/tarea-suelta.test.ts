import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PREFIJO_TAREA_DEVOLUCION } from '@central/module-seguros'
import { rechazoSuelta } from './tarea-suelta-reglas.ts'

const SUELTA = { oportunidadId: null, clienteId: 'c1', estado: 'pendiente', observaciones: 'Llamar a Ana' }

test('una tarea suelta abierta se puede cerrar/posponer; ajena, de oportunidad, hito o cerrada, no', () => {
  assert.equal(rechazoSuelta(SUELTA), null)
  assert.equal(rechazoSuelta({ ...SUELTA, observaciones: null, clienteId: null }), null, 'sin texto ni ficha sigue siendo suya')
  assert.equal(rechazoSuelta(undefined)?.status, 404, 'id de otra correduría (o inexistente) no es 409 ni ok')
  assert.equal(rechazoSuelta({ ...SUELTA, oportunidadId: 'o1' })?.status, 409, 'una tarea con oportunidad se salta su historial')
  assert.equal(rechazoSuelta({ ...SUELTA, observaciones: `${PREFIJO_TAREA_DEVOLUCION}Recibo devuelto` })?.status, 409, 'se toca un hito del art. 15 LCS')
  assert.equal(rechazoSuelta({ ...SUELTA, estado: 'cerrada' })?.status, 409)
})

// Cableado (lee el FUENTE): SQL crudo, donde tsc no mira.
const src = readFileSync(new URL('./tarea-suelta.ts', import.meta.url), 'utf8')

test('🪤 aislamiento: la lectura y las dos escrituras filtran por correduría; las escrituras, solo sueltas', () => {
  const lectura = /from gestiones where id = \$\{tareaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid for update/
  assert.match(src, lectura, 'la lectura no filtra por correduría o no bloquea la fila')
  const updates = src.match(/update gestiones set[\s\S]*?`\)/g) ?? []
  assert.equal(updates.length, 2)
  for (const u of updates) {
    assert.match(u, /where id = \$\{tareaId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and oportunidad_id is null/, 'una escritura sin correduría o sin «suelta»')
  }
})

test('🪤 las dos acciones pasan por rechazoSuelta antes de escribir, y el texto nulo no se pierde', () => {
  for (const f of ['cerrarTareaSuelta', 'posponerTareaSuelta']) {
    const i = src.indexOf(`export async function ${f}`)
    const cuerpo = src.slice(i, src.indexOf('\n}\n', i))
    assert.ok(cuerpo.indexOf('rechazoSuelta(t)') > 0 && cuerpo.indexOf('rechazoSuelta(t)') < cuerpo.indexOf('update gestiones'), `${f} escribe sin comprobar`)
    assert.match(cuerpo, /coalesce\(observaciones, ''\) \|\|/, `${f}: null || texto = null borra el rastro`)
  }
})

const ruta = readFileSync(new URL('../app/api/operador/oportunidad/tarea/route.ts', import.meta.url), 'utf8')

test('🪤 el puerto: solo `suelta: true` va por la vía sin oportunidad; la de siempre sigue exigiéndola', () => {
  assert.match(ruta, /if \(b\.suelta === true\) \{/)
  assert.match(ruta, /return cerrarTarea\(correduriaId, b\.tareaId, resultado, actorDe\(b\)\)/)
  assert.match(ruta, /export const PATCH = auditado\(/, 'la escritura sale de la auditoría')
  const cerrar = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
  assert.match(cerrar, /and oportunidad_id is not null for update/, 'cerrarTarea dejó de exigir oportunidad')
})
