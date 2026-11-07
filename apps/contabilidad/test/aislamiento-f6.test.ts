// Aislamiento por empresa en las CONSULTAS de la fase 6 (segunda capa, además de RLS): cada SQL de `repoF6Sql` lleva el filtro explícito de la empresa con la que
// se construyó, enlazado como parámetro. Y la fase 6 no emite DELETE; su único UPDATE de plan_cuentas es `admite_apuntes` y comentarios/revisiones solo se insertan.
// Cepo visto fallar el 07/11/2026: quitando `AND c.empresa_id = ${e}::uuid` de la consulta de comentarios → rojo; restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoF6Sql } from '../lib/repo-f6.ts'
import { respuestaDeErrorBdFase } from '../lib/errores-bd.ts'
import type { TxSql } from '../lib/rls.ts'

const E = '00000000-0000-4000-8000-00000000000a'
const U = '00000000-0000-4000-8000-0000000000f1'
type Llamada = { sql: string; valores: unknown[] }

function tx(): { tx: TxSql; llamadas: Llamada[] } {
  const llamadas: Llamada[] = []
  const fila = { n: 0, id: E, numero: 1, ejercicio: 2026, fecha: '2026-01-01', concepto: 'x', comentarios: 0, proveedor_nombre: 'P', total_cent: 1, origen: 'gmail', rol: 'gestor', autor: 'a', texto: 't', creado_en: new Date('2026-01-01'),
    nif: 'B12345674', nombre: 'n', tipo: 'cliente', email: null, telefono: null, activo: true }
  const t: TxSql = {
    async $queryRaw<T>(q: TemplateStringsArray, ...valores: unknown[]) { llamadas.push({ sql: q.join('?'), valores }); return [fila] as unknown as T },
    async $executeRaw(q: TemplateStringsArray, ...valores: unknown[]) { llamadas.push({ sql: q.join('?'), valores }); return 1 },
  }
  return { tx: t, llamadas }
}

test('cada método de RepoF6 filtra por empresa_id y enlaza la empresa como parámetro', async () => {
  const { tx: t, llamadas } = tx()
  const r = repoF6Sql(t, E)
  const tercero = { nif: 'B12345674', nombre: 'n', tipo: 'cliente' as const, email: null, telefono: null }
  const llamar: [string, () => Promise<unknown>][] = [
    ['contarAsientosSinRevisar', () => r.contarAsientosSinRevisar()],
    ['contarFacturasAConfirmar', () => r.contarFacturasAConfirmar()],
    ['contarAvisosSinLeer', () => r.contarAvisosSinLeer()],
    ['contarDeclaracionesBorrador', () => r.contarDeclaracionesBorrador()],
    ['asientosSinRevisar', () => r.asientosSinRevisar(10)],
    ['facturasAConfirmar', () => r.facturasAConfirmar(10)],
    ['comentarios(asiento)', () => r.comentarios({ tipo: 'asiento', id: E }, 10)],
    ['comentarios(factura)', () => r.comentarios({ tipo: 'factura_recibida', id: E }, 10)],
    ['comentarios(documento)', () => r.comentarios({ tipo: 'documento', ref: 'doc-1' }, 10)],
    ['insertarComentario(asiento)', () => r.insertarComentario({ objeto: { tipo: 'asiento', id: E }, usuarioId: U, rol: 'gestor', texto: 't' })],
    ['insertarComentario(documento)', () => r.insertarComentario({ objeto: { tipo: 'documento', ref: 'd' }, usuarioId: U, rol: 'dueno', texto: 't' })],
    ['insertarRevision(asiento)', () => r.insertarRevision({ tipo: 'asiento', id: E, usuarioId: U, rol: 'gestor' })],
    ['insertarRevision(factura)', () => r.insertarRevision({ tipo: 'factura_recibida', id: E, usuarioId: U, rol: 'gestor' })],
    ['insertarTerceros', () => r.insertarTerceros([tercero], U)],
    ['terceros', () => r.terceros(10)],
    ['contarTerceros', () => r.contarTerceros()],
    ['marcarCuentasNoHoja', () => r.marcarCuentasNoHoja(['430'])],
  ]
  for (const [nombre, fn] of llamar) {
    llamadas.length = 0
    await fn()
    assert.ok(llamadas.length > 0, nombre)
    for (const l of llamadas) {
      assert.match(l.sql, /empresa_id\s*=\s*\?::uuid|VALUES \(\?::uuid|SELECT \?::uuid/, `${nombre}: filtra por empresa_id`)
      assert.ok(l.valores.includes(E), `${nombre}: la empresa va enlazada como parámetro`)
      // Toda tabla de negocio que se lee lleva su filtro: ninguna consulta de lectura sin `empresa_id` explícito.
      if (/\bFROM contabilidad\.(comentarios|revisiones|asientos|facturas_recibidas|terceros|avisos|declaraciones)\b/.test(l.sql)) assert.match(l.sql, /empresa_id = \?::uuid/, `${nombre}: tabla de negocio sin filtro`)
    }
  }
})

test('la consulta de comentarios acota por empresa Y por objeto (no devuelve el hilo de un id de otra empresa)', async () => {
  const { tx: t, llamadas } = tx()
  await repoF6Sql(t, E).comentarios({ tipo: 'asiento', id: '00000000-0000-4000-8000-0000000000b1' }, 5)
  const sql = llamadas[0].sql
  assert.match(sql, /WHERE c\.empresa_id = \?::uuid/)
  assert.match(sql, /c\.asiento_id = \?::uuid/)
})

test('la fase 6 no emite DELETE ni TRUNCATE; sus UPDATE solo tocan admite_apuntes de plan_cuentas; comentarios y revisiones solo se insertan', () => {
  const src = ['repo-f6.ts', 'gestoria.ts', 'onboarding.ts', 'f6-carga.ts'].map((f) => readFileSync(join(import.meta.dirname, '..', 'lib', f), 'utf8')).join('\n')
  assert.doesNotMatch(src, /DELETE\s+FROM|TRUNCATE/i)
  const updates = [...src.matchAll(/UPDATE\s+contabilidad\.(\w+)/gi)].map((m) => m[1])
  assert.deepEqual([...new Set(updates)], ['plan_cuentas'])
  assert.match(src, /UPDATE contabilidad\.plan_cuentas SET admite_apuntes = false WHERE empresa_id = \$\{e\}::uuid/)
  assert.doesNotMatch(src, /UPDATE\s+contabilidad\.(comentarios|revisiones|asientos|apuntes)/i)
})

test('un esquema 0006 sin aplicar da 503 con el nombre del fichero; un duplicado, 409; lo demás, 500 sin disfrazar', () => {
  const sinTabla = respuestaDeErrorBdFase({ code: '42P01', message: 'relation "contabilidad.comentarios" does not exist' }, '0006_gestoria.sql')
  assert.equal(sinTabla.status, 503)
  assert.match(sinTabla.body.errores[0], /0006_gestoria\.sql/)
  assert.equal(respuestaDeErrorBdFase({ code: '23505' }, '0006_gestoria.sql').status, 409)
  assert.equal(respuestaDeErrorBdFase(new Error('otra cosa'), '0006_gestoria.sql').status, 500)
})
