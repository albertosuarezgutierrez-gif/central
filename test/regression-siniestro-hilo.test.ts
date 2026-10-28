// Guardián del hilo de siniestro (`seguros.siniestro_mensajes`, SQL 2026-10-28d). `node --test`, lee el FUENTE
// (readFileSync, sin importar nada de la app).
//
// Por qué: el hilo es SOLO-AÑADIR. Es el rastro de lo que se dijo a la compañía y de lo que contestó; un UPDATE o
// DELETE desde la app lo convierte en un texto reescribible (el mismo «lost update» que tiene hoy
// `siniestros.comentario`). La BD lo impide (trigger + GRANT), pero un fallo de aplicación no debe depender de que
// el SQL esté aplicado. Y el autor `ia` lo escribe SOLO el servidor: si el puerto lo aceptara, plataforma podría
// firmar como IA un texto que la IA no escribió.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

function ficherosDeAsegura(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx|sql)$/.test(f))
    .filter((f) => !f.includes('/generated/'))
}

/** Escrituras prohibidas sobre la tabla: SQL crudo o el delegado Prisma `siniestroMensaje`. */
export function escriturasProhibidas(src: string): string[] {
  const out: string[] = []
  const patrones: [RegExp, string][] = [
    [/\bupdate\s+(?:"?seguros"?\s*\.\s*)?"?siniestro_mensajes"?\s+set\b/i, 'UPDATE siniestro_mensajes'],
    [/\bdelete\s+from\s+(?:"?seguros"?\s*\.\s*)?"?siniestro_mensajes"?\b/i, 'DELETE FROM siniestro_mensajes'],
    [/\btruncate\s+(?:table\s+)?(?:"?seguros"?\s*\.\s*)?"?siniestro_mensajes"?\b/i, 'TRUNCATE siniestro_mensajes'],
    [/\.siniestroMensaje\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/, 'Prisma siniestroMensaje.$1'],
  ]
  for (const [re, etiqueta] of patrones) {
    const m = re.exec(src)
    if (m) out.push(etiqueta.replace('$1', m[1] ?? ''))
  }
  return out
}

test('el detector caza cada forma de escritura (un brazo por forma)', () => {
  assert.deepEqual(escriturasProhibidas('update seguros.siniestro_mensajes set texto = 1'), ['UPDATE siniestro_mensajes'])
  assert.deepEqual(escriturasProhibidas('UPDATE siniestro_mensajes SET meta = null'), ['UPDATE siniestro_mensajes'])
  assert.deepEqual(escriturasProhibidas('delete from siniestro_mensajes where id = $1'), ['DELETE FROM siniestro_mensajes'])
  assert.deepEqual(escriturasProhibidas('truncate table seguros.siniestro_mensajes'), ['TRUNCATE siniestro_mensajes'])
  assert.deepEqual(escriturasProhibidas('await db.siniestroMensaje.deleteMany({})'), ['Prisma siniestroMensaje.deleteMany'])
  assert.deepEqual(escriturasProhibidas('await tx.siniestroMensaje.update({})'), ['Prisma siniestroMensaje.update'])
  assert.deepEqual(escriturasProhibidas('await db.siniestroMensaje.create({}); db.siniestroMensaje.findMany()'), [])
  assert.deepEqual(escriturasProhibidas('BEFORE UPDATE OR DELETE ON seguros.siniestro_mensajes'), [], 'el trigger no es una escritura')
})

test('ningún fichero de apps/asegura hace UPDATE/DELETE sobre siniestro_mensajes', () => {
  const infractores: string[] = []
  for (const f of ficherosDeAsegura()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    for (const e of escriturasProhibidas(src)) infractores.push(`${f}: ${e}`)
  }
  assert.deepEqual(infractores, [], `siniestro_mensajes es SOLO-AÑADIR:\n  - ${infractores.join('\n  - ')}`)
})

test('el hilo no tiene rutas de edición ni borrado', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/siniestro/hilo/route.ts'), 'utf8')
  assert.doesNotMatch(src, /export\s+(const|async\s+function)\s+(PATCH|PUT|DELETE)\b/, 'solo GET y POST')
})

test('el POST del hilo rechaza autor «ia» y escribe con canal «operador»', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/siniestro/hilo/route.ts'), 'utf8')
  const post = src.slice(src.indexOf('export const POST'))
  assert.ok(post.length > 20, 'hay POST')
  assert.match(post, /b\.autor\s*===\s*'ia'[^\n]*status:\s*422/, 'rechazo explícito de autor «ia» con 422')
  assert.match(post, /canal:\s*'operador'/, 'la escritura va con canal «operador» (la regla pura también rechaza «ia»)')
  assert.doesNotMatch(post, /canal:\s*'servidor'/, 'el puerto nunca escribe como servidor')
})

test('la regla pura del canal «operador» no admite «ia»', () => {
  const src = readFileSync(join(ROOT, 'packages/module-seguros/src/siniestro-plazos.ts'), 'utf8')
  const m = /AUTORES_MENSAJE_OPERADOR\s*=\s*\[([^\]]*)\]/.exec(src)
  assert.ok(m, 'existe AUTORES_MENSAJE_OPERADOR')
  assert.doesNotMatch(m![1], /'ia'/)
})
