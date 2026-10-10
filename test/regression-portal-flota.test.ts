// Guardián de la FLOTA del portal (05/10/2026): un cliente NO ve la flota de otro.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// El rol `prisma_asegura_portal` NO tiene BYPASSRLS y la flota no añade RLS: lo
// único que separa la flota de una sociedad de la de otra es que TODA lectura de
// `lib/flota.ts` parta de `accesosFlota()` (resuelto desde la cookie) y que la
// empresa de la URL o del cuerpo solo se busque DENTRO de eso (`empresaPermitida`).
// La regla pura tiene su test en `packages/module-seguros-portal/src/flota.test.ts`;
// esto vigila que el fichero con BD la siga usando. Los comentarios se quitan antes
// de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const LIB = 'apps/asegura-portal/lib/flota.ts'

/** El cuerpo de una función exportada (hasta la siguiente `export` de primer nivel). */
function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre} en ${LIB}`)
  const j = src.indexOf('\nexport ', i + 1)
  return src.slice(i, j < 0 ? undefined : j)
}

test('🚨 accesosFlota sale de la COOKIE y de portal_vinculo de ESA identidad', () => {
  const f = cuerpo(leer(LIB), 'accesosFlota')
  assert.match(f, /await getIdentidad\(\)/)
  assert.match(f, /sesion\.id !== identidadId\) return new Map\(\)/)
  assert.match(f, /portalVinculo\.findMany\(\{\s*where: \{ identidadId \}/)
  // Las autorizaciones de flota, solo las que me alcanzan a MÍ.
  assert.match(f, /alcance: ALCANCE_FLOTA/)
  assert.match(f, /\{ autorizadoIdentidadId: identidadId \}/)
  assert.match(f, /autorizadoClienteId: \{ in: propias \}/)
})

test('🚨 la empresa pedida NUNCA consulta: se busca dentro de los accesos (404 si no está)', () => {
  const f = cuerpo(leer(LIB), 'flotaDeEmpresa')
  assert.match(f, /const accesos = await accesosFlota\(identidadId\)/)
  assert.match(f, /const empresaId = empresaPermitida\(empresaPedida, accesos\)/)
  assert.match(f, /if \(empresaId === null\) return null/)
  // Ninguna consulta usa el id CRUDO.
  assert.doesNotMatch(f, /empresaPedida[^,)]*\}/)
  assert.doesNotMatch(f, /id: empresaPedida/)
})

test('🚨 las pólizas de la flota se leen SOLO con el where de las empresas autorizadas', () => {
  const src = leer(LIB)
  const lecturas = src.match(/prisma\.poliza\.findMany\(/g) ?? []
  assert.equal(lecturas.length, 1, 'una sola lectura de pólizas en lib/flota.ts')
  assert.match(src, /const where = wherePolizasFlota\(\[empresaId\], WHERE_CARTERA_EN_VIGOR\)/)
  assert.match(src, /prisma\.poliza\.findMany\(\{\s*where,/)
  // `vehiculosDeEmpresa` solo se llama con la empresa YA permitida.
  for (const m of src.matchAll(/vehiculosDeEmpresa\(([^)]*)\)/g)) {
    if (m[0].includes('empresaId: string')) continue
    assert.equal(m[1], 'empresaId')
  }
})

test('🚨 el ancla del vehículo (portal_bien) se lee y escribe por la empresa autorizada', () => {
  const src = leer(LIB)
  for (const m of src.matchAll(/portalBien\.(findMany|updateMany)\(\{\s*where: \{([^}]*)\}/g)) {
    assert.match(m[2]!, /clienteId: empresaId/, `portalBien.${m[1]} sin clienteId: empresaId`)
  }
  assert.match(src, /portalBien\.create\(\{\s*data: \{\s*clienteId: empresaId,/)
  // `empresaId` dentro de guardarMatriculacion sale de la flota autorizada, no del cuerpo.
  assert.match(cuerpo(src, 'guardarMatriculacion'), /const empresaId = flota\.empresa\.id/)
})

test('🚨 nombrar jefe: empresa y candidato salen de lo resuelto por sesión, nunca del cuerpo', () => {
  const f = cuerpo(leer(LIB), 'nombrarJefeFlota')
  assert.match(f, /await flotaDeEmpresa\(datos\.identidadId, datos\.empresaId\)/)
  assert.match(f, /puedeNombrarJefeFlota\(flota\.papel\)/)
  assert.match(f, /flota\.candidatos\.find\(\(c\) => c\.clienteId === datos\.candidatoId\)/)
  assert.match(f, /otorganteClienteId: flota\.empresa\.id/)
  assert.match(f, /autorizadoClienteId: candidato\.clienteId/)
})

test('🚨 las rutas sacan la identidad de la cookie, nunca del cuerpo', () => {
  for (const r of ['apps/asegura-portal/app/api/flota/jefe/route.ts', 'apps/asegura-portal/app/api/flota/vehiculo/route.ts']) {
    const src = leer(r)
    assert.match(src, /identidad = await requireIdentidad\(\)/, r)
    assert.match(src, /identidadId: identidad\.id/, r)
    assert.doesNotMatch(src, /c\.identidadId|cuerpo\.identidadId/, r)
  }
  const pagina = leer('apps/asegura-portal/app/(portal)/flota/page.tsx')
  assert.match(pagina, /flotaDeEmpresa\(identidad\.id, pedida\)/)
  assert.match(pagina, /if \(flota === null\) notFound\(\)/)
})

test('la BD exige ficha entera y título para `flota`, y un solo dueño por bien', () => {
  const sql = leer('apps/asegura-portal/prisma/sql/2026-10-05_portal_flota_empresa.sql')
  assert.match(sql, /alcance IN \('ver', 'ver_economico', 'partes', 'documentos', 'total', 'flota'\)/)
  assert.match(sql, /alcance <> 'flota' OR \(poliza_id IS NULL AND titulo_representacion IS NOT NULL\)/)
  assert.match(sql, /num_nonnulls\(identidad_id, cliente_id\) = 1/)
})

test('la pantalla de Contactos no pinta los nombramientos de flota (tienen su sitio en /flota)', () => {
  const src = leer('apps/asegura-portal/lib/autorizaciones.ts')
  assert.match(src, /alcance: \{ not: ALCANCE_FLOTA \}/)
})
