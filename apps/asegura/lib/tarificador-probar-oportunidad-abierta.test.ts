// «Probar» AUTO/MOTO (01/11/2026): el trabajo se vincula a la oportunidad ABIERTA más reciente del cliente en ese ramo. `node --test`. Datos FICTICIOS.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { elegirOportunidadAbiertaProbar, type FilaOportunidadProbar } from './tarificador-relanzar-reglas.ts'

const f = (id: string, estado: string, createdAt: string, cerradaAt: string | null = null): FilaOportunidadProbar => ({ id, estado, cerradaAt, createdAt })

test('auto: elige la abierta más reciente; ganada/perdida/cerrada no cuentan', () => {
  const r = elegirOportunidadAbiertaProbar('auto', [
    f('a', 'ganada', '2026-10-30T10:00:00Z'),
    f('b', 'en_negociacion', '2026-10-20T10:00:00Z'),
    f('c', 'perdida', '2026-10-28T10:00:00Z'),
    f('d', 'competencia', '2026-10-29T10:00:00Z', '2026-10-31T10:00:00Z'),
  ])
  assert.deepEqual(r, { oportunidadId: 'b', avisos: [] })
})

test('moto vale igual; varias abiertas → la más reciente y un aviso', () => {
  const r = elegirOportunidadAbiertaProbar('moto', [f('x', 'competencia', '2026-10-01T10:00:00Z'), f('y', 'pendiente_cliente', '2026-10-25T10:00:00Z')])
  assert.equal(r.oportunidadId, 'y')
  assert.equal(r.avisos.length, 1)
})

test('sin abierta → null; otros ramos (hogar) no vinculan por aquí', () => {
  assert.deepEqual(elegirOportunidadAbiertaProbar('auto', [f('a', 'ganada', '2026-10-01T10:00:00Z')]), { oportunidadId: null, avisos: [] })
  assert.deepEqual(elegirOportunidadAbiertaProbar('hogar', [f('a', 'competencia', '2026-10-01T10:00:00Z')]), { oportunidadId: null, avisos: [] })
})

test('la ruta usa la elección y la lectura es solo SELECT con correduría', () => {
  const ruta = readFileSync(join(import.meta.dirname, '../app/api/operador/tarificador/probar/route.ts'), 'utf8')
  assert.match(ruta, /elegirOportunidadAbiertaProbar\(ramo, await leerOportunidadesProbarCliente\(correduria\.id, clienteId, ramo\)\)/)
  assert.match(ruta, /oportunidadId = deHogar \?\? abierta\.oportunidadId/)
  const lead = readFileSync(join(import.meta.dirname, 'tarificacion-lead.ts'), 'utf8')
  const tramo = lead.slice(lead.indexOf('async function leerOportunidadesProbarCliente'), lead.indexOf('type Interno'))
  assert.match(tramo, /o\.correduria_id = \$\{correduriaId\}/)
  assert.doesNotMatch(tramo, /\b(update|insert|delete)\b/i)
})
