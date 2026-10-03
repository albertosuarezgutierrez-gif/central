import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { seguimientosDePartes } from './parte-seguimiento.ts'

const sin = (id: string, estado = 'en_tramitacion') => ({
  id, estado, referencia: 'REF-1',
  tramitacion: { pasos: [], totalPagado: null, indemnizacion: null },
  detalle: { perito: { nombre: 'Pepe Perito', telefono: null, email: null }, tramitador: { nombre: 'Ana', telefono: null, email: null }, reserva: 999 },
})
const cartera = (siniestros: unknown, propia = true) => {
  const t = { polizas: [{ id: 'P1', siniestros }] }
  return { propias: propia ? [t] : [], autorizadas: propia ? [] : [t], intervinientes: [] } as never
}
const parte = { id: 'A', estado: 'abierto_en_compania', polizaId: 'P1', siniestroId: 'S1' }

test('cruza el parte con el siniestro DENTRO de la cartera autorizada', () => {
  const r = seguimientosDePartes([parte], cartera([sin('S1')])).get('A')
  assert.equal(r?.paso, 'en_tramitacion')
  assert.match(r!.texto, /perito asignado/)
  assert.match(r!.texto, /REF-1/)
  const json = JSON.stringify(r)
  for (const x of ['Pepe', 'Ana', '999']) assert.ok(!json.includes(x))
})

test('🔒 autorizado SIN alcance de siniestros (`null`): no hay estado', () => {
  assert.equal(seguimientosDePartes([parte], cartera(null, false)).get('A'), null)
})

test('🔒 póliza fuera de la cartera o parte sobre póliza aportada: no hay estado', () => {
  const c = cartera([sin('S1')])
  assert.equal(seguimientosDePartes([{ ...parte, polizaId: 'OTRA' }], c).get('A'), null)
  assert.equal(seguimientosDePartes([{ ...parte, polizaId: null }], c).get('A'), null)
})

test('🔒 un siniestro que NO está en la lista autorizada no se usa: cae a «Comunicado»', () => {
  const r = seguimientosDePartes([parte], cartera([sin('S2', 'cerrado')])).get('A')
  assert.equal(r?.paso, 'comunicado')
})

test('sin vínculo (siniestroId null): «Recibido, lo estamos gestionando»', () => {
  const r = seguimientosDePartes([{ ...parte, estado: 'recibido', siniestroId: null }], cartera([])).get('A')
  assert.equal(r?.texto, 'Recibido, lo estamos gestionando')
})

test('🪤 cepo: este fichero no lee la BD (el aislamiento lo da la cartera ya autorizada)', () => {
  const src = readFileSync(new URL('./parte-seguimiento.ts', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(src, /from ['"]\.\/db['"]|prisma\./)
})
