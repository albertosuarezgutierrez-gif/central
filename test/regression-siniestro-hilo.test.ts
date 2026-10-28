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

test('la ruta de IA del siniestro: valida la correduría, no usa aiComplete, una sola llamada y verifica citas', () => {
  const ruta = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/siniestro/ia/route.ts'), 'utf8')
  const lib = readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-ia.ts'), 'utf8')
  assert.match(ruta, /export const POST = auditado\(/, 'POST envuelto en auditado()')
  assert.match(ruta, /correduriaPedida\(b\.correduriaId\)/, 'valida la correduría pedida')
  for (const [n, src] of [['ruta', ruta], ['lib', lib]] as const) {
    assert.doesNotMatch(src, /\baiComplete\b/, `${n}: no llama a aiComplete (va por iaTexto)`)
  }
  assert.match(lib, /\biaTexto\(/, 'usa iaTexto')
  assert.equal((lib.match(/await iaTexto\(/g) ?? []).length, 1, 'una sola llamada a iaTexto, sin reintentos')
  assert.match(lib, /verificarCitas\(/, 'verifica las citas contra la póliza')
  assert.match(lib, /canal:\s*'servidor'/, 'escribe el autor ia con canal servidor')
  assert.match(lib, /correduriaId/, 'todo con correduriaId')
})

/** Cuerpo del `model Siniestro { ... }` de asegura.prisma. */
export function cuerpoModeloSiniestro(prisma: string): string {
  const m = /^model Siniestro \{([\s\S]*?)^\}/m.exec(prisma)
  return m ? m[1] : ''
}

test('el modelo Siniestro NO declara resultado* (código ANTES que el SQL 2026-10-28d: si no, todo findMany/create sin select falla con «column does not exist»)', () => {
  const cuerpo = cuerpoModeloSiniestro(readFileSync(join(ROOT, 'apps/asegura/prisma/asegura.prisma'), 'utf8'))
  assert.ok(cuerpo.length > 0, 'no se encontró model Siniestro')
  const sinComentarios = cuerpo.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.doesNotMatch(sinComentarios, /^\s*resultado\w*\s/m, 'resultado/resultadoMotivo/resultadoAt van por SQL crudo, no en el modelo, hasta aplicar el SQL')
  assert.doesNotMatch(sinComentarios, /@map\("resultado/, 'columna resultado* mapeada en el modelo')
})

// ─── Edición = versión nueva (sin UPDATE: el hilo sigue siendo SOLO-AÑADIR) ──────────────────────────────────

/** Cuerpo de `anadirMensajeSiniestro` (lib de asegura). */
export function cuerpoAnadirMensaje(lib: string): string {
  const i = lib.indexOf('export async function anadirMensajeSiniestro')
  if (i < 0) return ''
  const j = lib.indexOf('\n// ───', i)
  return lib.slice(i, j < 0 ? undefined : j)
}

test('editar un mensaje es AÑADIR una versión con meta.sustituyeA (nunca UPDATE) y la ruta lo propaga', () => {
  const lib = cuerpoAnadirMensaje(readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-hilo.ts'), 'utf8'))
  assert.ok(lib.length > 100, 'existe anadirMensajeSiniestro')
  assert.match(lib, /sustituyeA/, 'acepta sustituyeA')
  assert.match(lib, /db\.siniestroMensaje\.create\(/, 'la edición se guarda con create()')
  assert.deepEqual(escriturasProhibidas(lib), [], 'sin UPDATE/DELETE al editar')
  const ruta = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/siniestro/hilo/route.ts'), 'utf8')
  assert.match(ruta.slice(ruta.indexOf('export const POST')), /sustituyeA:/, 'el POST pasa sustituyeA a la lib')
})

test('sustituyeA se rechaza si el original es de la IA, de otro siniestro/autor o ya está sustituido (409)', () => {
  const lib = cuerpoAnadirMensaje(readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-hilo.ts'), 'utf8'))
  assert.match(lib, /original\.autor\s*===\s*'ia'\)\s*return\s+invalido\(/, 'un mensaje «ia» no se edita')
  assert.match(lib, /original\.siniestroId\s*!==\s*s\.id\)\s*return\s+invalido\(/, 'mismo siniestro')
  assert.match(lib, /original\.autor\s*!==\s*v\.mensaje\.autor\)\s*return\s+invalido\(/, 'mismo autor')
  assert.match(lib, /if\s*\(yaSustituido\)\s*return\s+yaEditado\(\)/, 'ya sustituido → yaEditado()')
  assert.match(lib, /where:\s*\{\s*id:\s*sustituyeA,\s*correduriaId\s*\}/, 'el original se busca con la correduría')
  const todo = readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-hilo.ts'), 'utf8')
  assert.match(todo, /status:\s*409/, '409 para «ya editado»')
})

test('plazos, espera y contexto de la IA leen solo la versión vigente (hiloVigente)', () => {
  const hilo = readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-hilo.ts'), 'utf8')
  assert.match(hilo, /hiloVigente\(/, 'siniestro-hilo.ts usa hiloVigente')
  assert.doesNotMatch(hilo, /mensajes\.map\(paraPlazos\)/, 'ya no pasa el hilo entero a los plazos')
  assert.match(hilo, /sustituyeA/, 'la consulta SQL de «esperando» también descarta las sustituidas')
  const ia = readFileSync(join(ROOT, 'apps/asegura/lib/siniestro-ia.ts'), 'utf8')
  assert.match(ia, /hiloVigente\(/, 'la IA lee solo la versión vigente')
})

test('volcado de la intranet: auditado() y con confirmar=false NO escribe (la propuesta sale antes de anadirMensajeSiniestro)', () => {
  const ruta = readFileSync(join(ROOT, 'apps/asegura/app/api/operador/siniestro/hilo/volcado/route.ts'), 'utf8')
  assert.match(ruta, /export const POST\s*=\s*auditado\(/, 'POST envuelto en auditado()')
  const propuesta = ruta.search(/if\s*\(\s*!b\.confirmar\s*\)/)
  const escritura = ruta.indexOf('anadirMensajeSiniestro(')
  const retorno = ruta.indexOf("estado: 'propuesta'")
  assert.ok(propuesta > 0 && escritura > 0 && retorno > 0, 'existen el guarda, la propuesta y la escritura')
  assert.ok(propuesta < escritura, 'el guarda de confirmar va ANTES de escribir')
  assert.ok(retorno > propuesta && retorno < escritura, 'la propuesta se devuelve antes de escribir')
  assert.equal(ruta.split('anadirMensajeSiniestro(').length - 1, 1, 'una sola vía de escritura')
  assert.deepEqual(escriturasProhibidas(ruta), [], 'sin UPDATE/DELETE')
  assert.match(ruta, /typeof b\.confirmar !== 'boolean'/, 'confirmar tiene que ser booleano (no se escribe por omisión)')
  assert.match(ruta, /huella/, 'salta los duplicados por huella')
})
