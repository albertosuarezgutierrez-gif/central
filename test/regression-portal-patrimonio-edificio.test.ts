// Guardián del EDIFICIO SIN DIVISIÓN HORIZONTAL del portal (27/10/2026): una unidad nunca cuelga de un edificio de OTRO
// titular, el SQL es aditivo (un solo borrado: el CHECK viejo de `uso`), el schema es espejo del GRANT y los catálogos de
// la BD son los del código. `node --test` (gate en CI vía `pnpm test:guardia`).
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const RUTA_SQL = 'apps/asegura-portal/prisma/sql/2026-10-27_portal_patrimonio_edificio_unidades.sql'
const crudo = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const sinComentariosSql = (s: string) => s.replace(/--.*$/gm, '')
const sinComentariosTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const SQL = sinComentariosSql(crudo(RUTA_SQL))
const ROL = 'prisma_asegura_portal'

const lista = (s: string) => s.split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean)

function concedidas(priv: 'SELECT' | 'INSERT' | 'UPDATE'): string[] {
  const re = new RegExp(`GRANT\\s+${priv}\\s*\\(([^)]*)\\)\\s+ON\\s+seguros\\.portal_patrimonio_inmueble\\s+TO\\s+${ROL}\\b`, 'gi')
  return [...SQL.matchAll(re)].flatMap((m) => lista(m[1]))
}

test('🚨 SQL aditivo: transaccional, UN solo borrado (el CHECK viejo de uso), el nuevo ANTES, y se aplica desde el editor', () => {
  assert.match(SQL, /^BEGIN;/m)
  assert.match(SQL, /^COMMIT;/m)
  const borrados = [...SQL.matchAll(/\bDROP\b[^;]*;/gi)].map((x) => x[0].replace(/\s+/g, ' '))
  assert.deepEqual(borrados, ['DROP CONSTRAINT IF EXISTS portal_patrimonio_inmueble_uso_check;'])
  assert.ok(SQL.indexOf('ADD CONSTRAINT portal_patrimonio_inmueble_uso_catalogo_v2') < SQL.indexOf('DROP CONSTRAINT'))
  assert.match(SQL, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_uso_catalogo_v2'\)/)
  assert.match(crudo(RUTA_SQL), /EDITOR SQL de Supabase, NO por el MCP/i)
  assert.doesNotMatch(SQL, /\bDELETE\b|\bTRUNCATE\b|ALTER COLUMN/i)
  assert.match(SQL, /ADD COLUMN IF NOT EXISTS inmueble_padre_id\s+uuid,/)
})

test('🚨 una unidad NO cuelga de un edificio de otro titular: FK compuesta (padre, titular) → (id, titular) + un solo nivel', () => {
  assert.match(
    SQL,
    /FOREIGN KEY \(inmueble_padre_id, titular_id\) REFERENCES seguros\.portal_patrimonio_inmueble \(id, titular_id\)/,
  )
  assert.match(SQL, /CHECK \(inmueble_padre_id IS NULL OR inmueble_padre_id <> id\)/)
  assert.match(SQL, /CREATE TRIGGER trg_portal_patrimonio_inmueble_un_nivel\s+BEFORE INSERT OR UPDATE OF uso, inmueble_padre_id/)
  assert.match(SQL, /p_uso IS DISTINCT FROM 'edificio' OR p_padre IS NOT NULL/)
})

test('🚨 permisos: GRANT por columnas, sin DELETE, el portal no REASIGNA padres, crm_seguros sin nada', () => {
  assert.deepEqual(concedidas('SELECT').sort(), ['inmueble_padre_id', 'reparto_criterio', 'reparto_porcentaje'])
  assert.deepEqual(concedidas('INSERT').sort(), ['inmueble_padre_id', 'reparto_criterio', 'reparto_porcentaje'])
  assert.deepEqual(concedidas('UPDATE').sort(), ['reparto_criterio', 'reparto_porcentaje'])
  for (const m of SQL.matchAll(new RegExp(`GRANT\\s+([^;]*?)\\s+ON\\s+(?:TABLE\\s+)?seguros\\.portal_patrimonio_\\w+\\s+TO\\s+${ROL}\\b`, 'gi'))) {
    assert.doesNotMatch(m[1], /DELETE|\bALL\b|TRUNCATE/i)
    assert.match(m[1], /^(SELECT|INSERT|UPDATE)\s*\(/i)
  }
  assert.match(SQL, /REVOKE ALL ON seguros\.portal_patrimonio_inmueble FROM crm_seguros/)
})

test('🚨 schema.prisma declara EXACTAMENTE las columnas concedidas (espejo, si no 42501 en toda lectura)', () => {
  const schema = crudo('apps/asegura-portal/prisma/schema.prisma')
  const modelo = /^model PortalPatrimonioInmueble \{([\s\S]*?)^\}/m.exec(schema)
  assert.ok(modelo)
  const cols = [...modelo[1].matchAll(/@map\("(inmueble_padre_id|reparto_criterio|reparto_porcentaje)"\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(cols, concedidas('SELECT').sort())
  assert.match(modelo[1], /repartoPorcentaje\s+Decimal\?\s+@map\("reparto_porcentaje"\) @db\.Decimal\(5, 2\)/)
  assert.match(modelo[1], /inmueblePadreId\s+String\?\s+@map\("inmueble_padre_id"\) @db\.Uuid/)
})

test('catálogos de la BD = los del código: uso (con «edificio») y criterio de reparto', () => {
  const v2 = /portal_patrimonio_inmueble_uso_catalogo_v2\s+CHECK \(uso IN \(([^)]*)\)\)/.exec(SQL)
  assert.ok(v2)
  const usosSql = lista(v2[1])
  const usos = /USOS_INMUEBLE = \[([^\]]*)\]/.exec(sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/usos.ts')))
  assert.ok(usos)
  assert.deepEqual(lista(usos[1]), usosSql)
  const lectura = /const USOS: readonly UsoInmueble\[\] = \[([^\]]*)\]/.exec(sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/lectura.ts')))
  assert.ok(lectura)
  assert.deepEqual(lista(lectura[1]), usosSql)
  assert.ok(usosSql.includes('edificio'))
  const crit = /reparto_criterio IN \(([^)]*)\)/.exec(SQL)
  const critMod = /CRITERIOS_REPARTO = \[([^\]]*)\]/.exec(crudo('packages/module-patrimonio/src/edificio.ts'))
  assert.ok(crit && critMod)
  assert.deepEqual(lista(crit[1]), lista(critMod[1]))
})

test('🚨 edificio-bd: parte de accesosPatrimonio, la sesión es la de identidadId y TODA consulta va dentro del titular', () => {
  const src = sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/edificio-bd.ts'))
  assert.match(src, /accesosPatrimonio\(identidadId\)/)
  assert.match(src, /getIdentidad\(\)\)\?\.id !== identidadId\) return null/)
  assert.match(src, /where: \{ id, titular: \{ clienteId: \{ in: \[\.\.\.accesos\.keys\(\)\] \}, archivadoEn: null \} \}/)
  // Cada consulta que no es la de entrada lleva el titular del edificio ya autorizado.
  const consultas = [...src.matchAll(/portalPatrimonioInmueble\.(findMany|findFirstOrThrow|updateMany)\(\{\s*where: \{([^}]*)\}/g)]
  assert.ok(consultas.length >= 4)
  for (const c of consultas) assert.match(c[2], /titularId: (fila|edificio)\.titularId/, `${c[1]} sin el titular: ${c[2]}`)
  // La unidad nace en el titular DEL EDIFICIO y colgando de ÉL; nada del cuerpo.
  assert.match(src, /titularId: edificio\.titularId,\s*inmueblePadreId: edificio\.id,/)
  assert.doesNotMatch(src, /\.delete\(|\.deleteMany\(|\$queryRawUnsafe|\$executeRawUnsafe/)
})

test('🚨 la ficha y el alta en bloque: padre y unidades se buscan DENTRO del mismo titular', () => {
  const src = sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/inmuebles-bd.ts'))
  assert.match(src, /where: \{ id: fila\.inmueblePadreId, titularId: fila\.titularId \}/)
  assert.match(src, /where: \{ inmueblePadreId: fila\.id, titularId: fila\.titularId, archivadoEn: null \}/)
  assert.match(src, /prisma\.\$transaction\(async \(tx\) =>/)
  assert.match(src, /data: datos\.unidades\.map\(\(alias\) => \(\{ \.\.\.comun, alias, uso: 'vivienda', inmueblePadreId: creado\.id \}\)\)/)
  for (const r of ['unidades', 'reparto']) {
    const ruta = sinComentariosTs(crudo(`apps/asegura-portal/app/api/patrimonio/inmuebles/[id]/${r}/route.ts`))
    assert.match(ruta, /requireIdentidad\(\)/)
    assert.doesNotMatch(ruta, /prisma/, `${r}: la ruta no consulta por sí misma`)
  }
})

test('🚨 la RC heredada (`rcEfectiva`) es para ENSEÑAR y DECLARAR, nunca para cruzar pólizas, Catastro ni señales', () => {
  for (const f of [
    'apps/asegura-portal/lib/patrimonio/poliza-sin-inmueble-bd.ts',
    'apps/asegura-portal/lib/patrimonio/seguros-inmueble-bd.ts',
    'apps/asegura-portal/lib/patrimonio/cubre-seguro-bd.ts',
    'apps/asegura/lib/patrimonio-senales.ts',
  ]) assert.doesNotMatch(sinComentariosTs(crudo(f)), /rcEfectiva/, `${f}: con la RC del edificio la póliza del edificio caería en cada piso`)
  assert.match(sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/inmuebles-bd.ts')), /referenciaCatastralEfectiva: rcEfectiva\(/)
  assert.match(sinComentariosTs(crudo('apps/asegura-portal/lib/patrimonio/rentabilidad-bd.ts')), /referenciaCatastral: rcEfectiva\(/)
})
