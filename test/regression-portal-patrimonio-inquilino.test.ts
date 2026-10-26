// Guardián del INQUILINO del patrimonio (22/10/2026, paso 9): el portal NUNCA guarda el NIF (ni el correo ni el
// teléfono) del inquilino en claro, y la renta aplicada es APPEND-ONLY. `node --test` (gate vía `pnpm test:guardia`).
//
// Por qué: el portal es la app pública y no tiene `PII_ENCRYPTION_KEY`. La PII del inquilino (un TERCERO: sus datos son
// un encargo de tratamiento del propietario) se cifra en `apps/asegura` por el puente. Si alguien «simplifica» y la
// guarda desde el portal, la deja en claro en la BD compartida. Y si `encryptField` cae a su modo desarrollo (sin clave
// devuelve el texto), el puente tiene que negarse en vez de escribirla en claro.
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const SCHEMA = 'apps/asegura-portal/prisma/schema.prisma'
const SQL = 'apps/asegura-portal/prisma/sql/2026-10-22_portal_patrimonio.sql'
const PUENTE_PORTAL = 'apps/asegura-portal/lib/patrimonio/inquilinos-puente.ts'
const CONTRATOS_BD = 'apps/asegura-portal/lib/patrimonio/contratos-bd.ts'
const ASEGURA_BD = 'apps/asegura/lib/patrimonio-inquilino-portal.ts'
const ASEGURA_REGLAS = 'apps/asegura/lib/patrimonio-inquilino-reglas.ts'

function modelo(schema: string, nombre: string): string {
  const i = schema.indexOf(`model ${nombre} {`)
  assert.ok(i >= 0, `falta el modelo ${nombre}`)
  return schema.slice(i, schema.indexOf('\n}', i))
}

/** Campos de PII en claro o cifrada que el modelo del portal NO puede declarar. */
const CAMPO_PII = /^\s+(nif\w*|dni\w*|telefono\w*|email(?!Hash)\w*|iban\w*)\s/m

test('🚨 el modelo Prisma del inquilino en el PORTAL no declara NIF, correo ni teléfono (solo el índice ciego)', () => {
  const m = modelo(readFileSync(join(ROOT, SCHEMA), 'utf8'), 'PortalPatrimonioInquilino')
  assert.doesNotMatch(m, CAMPO_PII)
  assert.match(m, /emailHash\s+String\?/)
})

test('🚨 el rol del portal no tiene INSERT en el inquilino ni ve/escribe sus columnas cifradas', () => {
  const sql = readFileSync(join(ROOT, SQL), 'utf8').replace(/--.*$/gm, '')
  const grants = [...sql.matchAll(/GRANT\s+(\w+)\s*\(([^)]*)\)\s*ON\s+seguros\.portal_patrimonio_inquilino\s+TO\s+prisma_asegura_portal/gi)]
  assert.ok(grants.length > 0, 'el cepo no está viendo los GRANT del inquilino')
  for (const g of grants) {
    assert.notEqual(g[1].toUpperCase(), 'INSERT', 'el alta del inquilino va por el puente, no por el rol del portal')
    assert.doesNotMatch(g[2], /_cifrado/)
  }
  assert.doesNotMatch(sql, /GRANT\s+(ALL|INSERT)\b[^;]*ON\s+seguros\.portal_patrimonio_inquilino\s+TO\s+prisma_asegura_portal/i)
})

test('🚨 ningún fichero del portal crea inquilinos ni nombra sus columnas cifradas', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
  assert.ok(ficheros.includes(PUENTE_PORTAL), 'el cepo no está viendo el puente del inquilino')
  const infractores = ficheros.filter((f) => {
    const src = leer(f)
    return (
      /portalPatrimonioInquilino\s*\.\s*(create|createMany|upsert)\b/.test(src) ||
      /\b(nifCifrado|emailCifrado|telefonoCifrado|nif_cifrado|email_cifrado|telefono_cifrado)\b/.test(src)
    )
  })
  assert.deepEqual(infractores, [], `Estos ficheros del portal escriben o leen la PII del inquilino:\n  - ${infractores.join('\n  - ')}`)
})

test('🚨 el puente del portal no consulta la BD ni escribe la PII en un log', () => {
  const src = leer(PUENTE_PORTAL)
  assert.doesNotMatch(src, /prisma/)
  for (const m of src.matchAll(/console\.\w+\(([^\n]*)\)/g)) {
    assert.doesNotMatch(m[1], /\b(datos|cuerpo|init|nif|email|telefono|j)\b/, `log con datos: ${m[0]}`)
  }
})

test('🚨 asegura: el alta cifra ANTES de escribir, se niega sin clave y nunca inserta el texto del cuerpo', () => {
  const src = leer(ASEGURA_BD)
  const f = src.slice(src.indexOf('export async function altaInquilinoDesdePortal'), src.indexOf('export type ResultadoPiiPuente'))
  const iCifra = f.indexOf('cifrarAltaInquilino(d)')
  assert.ok(iCifra >= 0, 'el alta tiene que pasar por cifrarAltaInquilino')
  assert.match(f, /if \(pii === null\) return \{ estado: 'sin_clave' \}/)
  assert.ok(iCifra < f.indexOf('$transaction'), 'se cifra antes de abrir la transacción')
  assert.match(f, /\$\{pii\.nifCifrado\}/)
  assert.doesNotMatch(f, /\$\{d\.(nif|email|telefono)\}/, 'la PII del cuerpo no entra cruda en el INSERT')
  // El titular sale del CONTRATO y se recalcula el nivel: nada de titular/ficha del cuerpo.
  assert.match(f, /puedePatrimonio\(correduriaId, d\.identidadId, c\.cliente_id, 'alta_baja'\)/)
  assert.doesNotMatch(leer(ASEGURA_REGLAS), /b\.(clienteId|titular|titularId)\b/)
})

test('🚨 asegura: cifrarPii exige el sobre v1 (el modo desarrollo de encryptField devolvería el texto en claro)', () => {
  const src = leer(ASEGURA_REGLAS)
  assert.match(src, /return c\.startsWith\('v1:'\) && c !== v \? c : null/)
})

test('🚨 la renta aplicada es APPEND-ONLY: el portal solo inserta filas nuevas', () => {
  const src = leer(CONTRATOS_BD)
  assert.match(src, /portalPatrimonioRentaActualizacion\.create\(/)
  assert.doesNotMatch(src, /portalPatrimonioRentaActualizacion\.(update|updateMany|upsert|delete|deleteMany)\(/)
  assert.doesNotMatch(src, /\$executeRaw|\$queryRaw/)
})

test('🚨 leer la PII del inquilino deja traza en auditoria (ids, sin PII) ANTES de devolverla', () => {
  const src = leer(ASEGURA_BD)
  const i = src.indexOf('export async function piiInquilinoParaPortal')
  assert.ok(i >= 0)
  const cuerpo = src.slice(i)
  const traza = cuerpo.search(/insert into auditoria[\s\S]*?'GET'/)
  const devuelve = cuerpo.search(/estado: 'ok',\s*nif:/)
  assert.ok(traza >= 0, 'la lectura de PII no deja traza en auditoria')
  assert.ok(traza < devuelve, 'la traza tiene que escribirse antes de devolver el dato')
  assert.match(cuerpo, /JSON\.stringify\(\{ identidadId, inquilinoId \}\)/)
  assert.doesNotMatch(cuerpo.slice(traza, cuerpo.indexOf('::jsonb', traza)), /nif_cifrado|descifrarCampo|telefono|email/)
})

test('🚨 el alta compara el documento NORMALIZADO dentro del mismo titular y no crea duplicado sin que la persona lo acepte', () => {
  const src = leer(ASEGURA_BD)
  assert.match(src, /buscarDuplicadoPorNif\(d\.nif/)
  assert.match(src, /where titular_id = \$\{c\.titular_id\}::uuid and archivado_en is null and nif_cifrado is not null/)
  assert.match(src, /if \(d\.reutilizarId !== dup\.id\) return \{ estado: 'duplicado'/)
})
