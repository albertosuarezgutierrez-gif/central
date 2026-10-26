// Cepo RGPD (26/10/2026): el borrador del enlace de datos se borra (borrador y borrador_at) en toda solicitud MUERTA
// —completada, anulada o caducada— y nunca en una pendiente viva; sin la columna no falla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { limpiarBorradoresMuertos, type DbBorradorPurga } from './solicitud-borrador-purga.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'

function bdFalsa(r: number | Error) {
  const sentencias: { sql: string; valores: unknown[] }[] = []
  const db: DbBorradorPurga = {
    $executeRaw: async (q: TemplateStringsArray, ...v: unknown[]) => {
      sentencias.push({ sql: q.join('?').replace(/\s+/g, ' '), valores: v })
      if (r instanceof Error) throw r
      return r
    },
  }
  return { db, sentencias }
}

test('cada filtro anula borrador Y borrador_at, solo en solicitudes muertas (no pendiente o caducada)', async () => {
  for (const f of [{ id: ID, correduriaId: C }, { oportunidadId: ID, clienteId: ID, correduriaId: C }, { correduriaId: C }]) {
    const { db, sentencias } = bdFalsa(2)
    assert.deepEqual(await limpiarBorradoresMuertos(db, f), { estado: 'ok', limpiados: 2 })
    const sql = sentencias[0].sql
    assert.match(sql, /set borrador = null, borrador_at = null/)
    assert.match(sql, /and \(estado <> 'pendiente' or caduca_at <= now\(\)\)/, 'una pendiente viva no se toca')
    assert.match(sql, /correduria_id = \?::uuid/, 'siempre acotado a la correduría')
    assert.ok(sentencias[0].valores.includes(C))
  }
})

test('sin la columna (SQL sin aplicar) no falla: sin_migracion; otro error tampoco lanza', async () => {
  const sinColumna = Object.assign(new Error('column "borrador" does not exist'), { code: 'P2010', meta: { code: '42703' } })
  assert.deepEqual(await limpiarBorradoresMuertos(bdFalsa(sinColumna).db, { correduriaId: C }), { estado: 'sin_migracion' })
  assert.deepEqual(await limpiarBorradoresMuertos(bdFalsa(new Error('conexión')).db, { correduriaId: C }), { estado: 'error' })
})

test('se llama al anular (a mano, por oportunidad cerrada, al sustituir la caducada), al completar y en la purga diaria', () => {
  const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
  const anular = src.slice(src.indexOf('export async function anularSolicitud'), src.indexOf('// ─── Lado del portal'))
  assert.match(anular, /limpiarBorradoresMuertos\(prismaAsegura\(\), \{ id, correduriaId \}\)/, 'anular a mano')
  const crear = src.slice(src.indexOf('export async function crearSolicitud'), src.indexOf('export async function camposParaPersona'))
  assert.match(crear, /limpiarBorradoresMuertos\(prismaAsegura\(\), \{ oportunidadId, clienteId: persona, correduriaId \}\)/, 'sustituir la caducada')
  const responder = src.slice(src.indexOf('export async function responderSolicitud'), src.indexOf('// ─── Borrador por token'))
  assert.match(responder, /limpiarBorradoresMuertos\(prismaAsegura\(\), \{ id: f\.id, correduriaId: f\.correduriaId \}\)/, 'completar / oportunidad cerrada')
  assert.doesNotMatch(responder, /if \(hecho\) await limpiarBorradoresMuertos/, 'también cuando la oportunidad cerrada la anula (hecho = false)')
  const cron = readFileSync(new URL('../app/api/cron/purga-rgpd/route.ts', import.meta.url), 'utf8')
  assert.match(cron, /limpiarBorradoresMuertos\(prisma, \{ correduriaId: correduria\.id \}\)/, 'purga diaria de caducadas y anuladas')
})
