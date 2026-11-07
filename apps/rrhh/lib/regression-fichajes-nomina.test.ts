/**
 * Guardián `regression-fichajes-nomina` (N2, parte de la app; la parte pura vive en packages/module-nominas/src/incidencias-fichajes.test.ts).
 * Fichajes → propuestas de horas extra: SOLO fichajes aprobados, MISMO empresa_id, MES cerrado, y nada entra solo en la nómina.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hoyMadrid } from './fecha-madrid'

const APP = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(APP, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
const lib = leer('lib/fichajes-nomina.ts')

/** Cada plantilla SQL entre backticks que nombra rrhh.fichajes (o incidencias_mes/solicitudes/nominas) nombra empresa_id. */
function sqlSinEmpresa(src: string, tabla: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(new RegExp(`rrhh\\.${tabla}\\b`, 'g'))) {
    const ini = src.lastIndexOf('`', m.index), fin = src.indexOf('`', m.index! + m[0].length)
    if (!/\bempresa_id\b/.test(src.slice(ini, fin))) out.push(src.slice(ini, ini + 60))
  }
  return out
}

describe('fichajes → nómina: aislamiento por empresa (rrhh_app tiene BYPASSRLS)', () => {
  it('toda consulta sobre fichajes, incidencias, nóminas y solicitudes filtra por empresa_id', () => {
    for (const t of ['fichajes', 'incidencias_mes', 'nominas', 'solicitudes']) expect(sqlSinEmpresa(lib, t), t).toEqual([])
    expect(lib).toMatch(/FROM rrhh\.empresas WHERE id = \$\{empresaId\}::uuid/)
    expect(lib).toMatch(/prisma\.nominas\.findFirst\(\{ where: \{ id: nominaId, empresa_id: empresaId \}/)
    expect(lib).toMatch(/prisma\.contratos_laborales\.findFirst\(\{ where: \{ empresa_id: empresaId/)
  })
  it('el SELECT de fichajes filtra también por empleado y trae aprobado_at', () => {
    const q = lib.slice(lib.indexOf('FROM rrhh.fichajes f'), lib.indexOf('ORDER BY f.entrada_at'))
    expect(q).toMatch(/f\.empresa_id = \$\{empresaId\}::uuid AND f\.empleado_id = \$\{empleadoId\}::uuid/)
    expect(lib).toMatch(/aprobado: f\.aprobado_at != null/)
  })
  it('las rutas toman empresa_id SOLO de getSesion() y del cliente solo aceptan claves', () => {
    for (const r of ['propuestas-fichajes', 'aprobar-fichajes']) {
      const s = leer(`app/api/admin/nominas/[nominaId]/${r}/route.ts`)
      expect(s, r).toMatch(/await getSesion\(\)/)
      expect(s, r).not.toMatch(/(body|searchParams|params)\s*\??\.\s*empresa_?id/i)
    }
    const post = leer('app/api/admin/nominas/[nominaId]/propuestas-fichajes/route.ts')
    expect(post).toMatch(/body\?\.claves/)
    expect(post).not.toMatch(/body\??\.(horas|importe|dias|incidencia)/)
  })
})

describe('fichajes → nómina: solo aprobados, mes cerrado, aprueba el responsable', () => {
  it('el reloj se inyecta: la función pura recibe `hoy` de hoyMadrid(), y el mes cerrado lo exige el módulo', () => {
    expect(lib).toMatch(/periodo, hoy, diasPrevistos:/)
    expect(hoyMadrid(new Date('2026-04-01T22:30:00Z'))).toBe('2026-04-02') // 00:30 en Madrid (CEST)
    expect(hoyMadrid(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15')
    const modulo = readFileSync(join(APP, '../../packages/module-nominas/src/incidencias-fichajes.ts'), 'utf8')
    expect(modulo).toMatch(/opts\.periodo >= opts\.hoy\.slice\(0, 7\)\) throw new MesNoCerradoError/)
    expect(modulo).toMatch(/if \(!f\.aprobado\)/)
  })
  it('aprobar propuestas RECALCULA en servidor y descarta lo informativo, compensado o por encima del tope; nómina confirmada = error', () => {
    const a = lib.slice(lib.indexOf('export async function aprobarPropuestas'), lib.indexOf('export async function aprobarFichajesDeLaNomina'))
    expect(a).toMatch(/await proponerDesdeFichajes\(empresaId, nominaId, hoy\)/)
    expect(a).toMatch(/if \(!x\.incidencia\)/)
    expect(a).toMatch(/if \(x\.superaTope\)/)
    expect(a).toMatch(/p\.nominaEstado !== 'borrador'/)
    expect(a).toMatch(/origen: \{ clave: x\.clave/)
  })
  it('la propuesta nunca escribe sola: proponerDesdeFichajes no inserta ni actualiza nada', () => {
    const p = lib.slice(lib.indexOf('export async function proponerDesdeFichajes'), lib.indexOf('export type ResultadoAprobacion'))
    expect(p).not.toMatch(/INSERT|UPDATE|DELETE|addIncidencia|\.create\(|\.update/)
    expect(leer('app/api/admin/nominas/[nominaId]/propuestas-fichajes/route.ts')).toMatch(/export async function GET[\s\S]*proponerDesdeFichajes/)
  })
  it('el cron de nóminas NO consume fichajes (las extras solo entran por aprobación)', () => {
    expect(leer('app/api/cron/nominas/route.ts')).not.toMatch(/fichajes|propon|aprobar/i)
    expect(leer('lib/nominas.ts')).not.toMatch(/rrhh\.fichajes/)
  })
  it('aprobar fichajes: solo cerrados y sin aprobar del empleado/mes de ESA nómina; corregir un fichaje anula su aprobación', () => {
    const q = lib.slice(lib.indexOf('UPDATE rrhh.fichajes SET aprobado_at'), lib.indexOf('Europe/Madrid\', \'YYYY-MM\')'))
    expect(q).toMatch(/empresa_id = \$\{empresaId\}::uuid AND empleado_id = \$\{nomina\.empleado_id\}::uuid/)
    expect(q).toMatch(/estado = 'cerrado' AND salida_at IS NOT NULL AND aprobado_at IS NULL/)
    expect(leer('app/api/admin/fichajes/[id]/route.ts')).toMatch(/SET aprobado_at = NULL, aprobado_por = NULL/)
  })
  it('el panel enlaza a los fichajes de origen y la pantalla de fichajes acepta mes/empleado validados', () => {
    expect(leer('app/admin/nominas/[periodo]/PropuestasFichajes.tsx')).toMatch(/\/admin\/fichajes\?mes=\$\{d\.periodo\}&empleado_id=\$\{d\.empleadoId\}/)
    const pg = leer('app/admin/fichajes/page.tsx')
    expect(pg).toMatch(/MES\.test\(q\.mes\)/)
    expect(pg).toMatch(/UUID\.test\(q\.empleado_id\)/)
  })
})

describe('migración 0033 (N2)', () => {
  const sql = readFileSync(join(APP, 'prisma/migrations/0033_fichajes_nomina_hechos.sql'), 'utf8').replace(/^\s*--.*$/gm, '')
  it('es aditiva e idempotente y los fichajes anteriores NO quedan aprobados', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS aprobado_at\s+timestamptz,/)
    expect(sql).not.toMatch(/aprobado_at[^,;]*DEFAULT/i)
    expect(sql).not.toMatch(/DROP |TRUNCATE|DELETE FROM/i)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS incidencias_mes_origen_clave_uq/)
    for (const l of sql.split(';')) if (/CREATE (UNIQUE )?INDEX|CREATE TABLE/.test(l)) expect(l).toMatch(/IF NOT EXISTS/)
  })
})
