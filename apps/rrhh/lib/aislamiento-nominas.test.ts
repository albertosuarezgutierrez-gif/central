/**
 * Cepo de aislamiento de NÓMINAS/EMPLEADOS (N0, 05/11/2026). `rrhh_app` tiene BYPASSRLS: el aislamiento por empresa es
 * SOLO de código. Más estricto que `test/regression-lote2-rrhh-empresa.test.ts`.
 *  1. En TODO `lib/` y en las rutas/pantallas de nómina, cada sentencia SQL sobre nominas / incidencias_mes / empleados /
 *     contratos_laborales / empresa_modulos FILTRA por `empresa_id` (una condición por tabla en WHERE/ON; nombrarla en el
 *     SELECT no vale — 07/11/2026) y cada `prisma.<modelo>.<op>(…)` la nombra.
 *     Únicas excepciones: `MULTIEMPRESA` (fichero + tabla EXACTOS, una sentencia cada una, con motivo). Una sentencia
 *     nueva sin filtro en esos ficheros, o una excepción que ya no se usa, también falla.
 *  2. Las rutas /api/admin/nominas/** sacan `empresa_id` de `getSesion()` y nunca del cuerpo, la query o los params.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const APP = join(__dirname, '..')
const TABLAS = ['nominas', 'incidencias_mes', 'empleados', 'contratos_laborales', 'empresa_modulos']

function listar(dir: string): string[] {
  const out: string[] = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...listar(p))
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
}

function cuerpoLlamada(s: string, abre: number): string {
  let d = 0
  for (let i = abre; i < s.length; i++) {
    if (s[i] === '(') d++
    else if (s[i] === ')' && --d === 0) return s.slice(abre, i + 1)
  }
  return s.slice(abre)
}

/**
 * ¿La sentencia FILTRA por empresa? No basta con que la palabra aparezca (en el SELECT `n.empresa_id AS empresa_id`
 * no filtra nada). INSERT: `empresa_id` en la lista de columnas. Resto: tantas CONDICIONES `[alias.]empresa_id =|IN|IS`
 * (en WHERE/ON/AND, o como lado derecho de `x.empresa_id = y.empresa_id`) como referencias a tablas vigiladas.
 */
export function sqlFiltraEmpresa(trozo: string, alt: string): boolean {
  if (/^\s*`?\s*INSERT\s+INTO\b/i.test(trozo) || /\bINSERT\s+INTO\s+rrhh\s*\.\s*\w+\s*\([^)]*\bempresa_id\b/i.test(trozo)) {
    return /\bINSERT\s+INTO\s+rrhh\s*\.\s*\w+\s*\([^)]*\bempresa_id\b/i.test(trozo)
  }
  const refs = [...trozo.matchAll(new RegExp(`\\brrhh\\s*\\.\\s*(${alt})\\b`, 'gi'))].length
  // Condición: columna empresa_id (no interpolada `${empresa_id}`) seguida de comparador.
  const condiciones = [...trozo.matchAll(/(?<!\$\{\s*)(?<![\w$])(?:\w+\.)?empresa_id\s*(?:=|IN\b|IS\s+NOT\s+DISTINCT\b)/gi)].length
  const tieneWhere = /\b(WHERE|ON)\b/i.test(trozo)
  return tieneWhere && condiciones >= refs
}

export function sentenciasSinEmpresa(src: string): string[] {
  const s = sinComentarios(src)
  const alt = [...TABLAS].sort((a, b) => b.length - a.length).join('|')
  const malas: string[] = []
  const vistos = new Set<string>()
  for (const m of s.matchAll(new RegExp(`\\brrhh\\s*\\.\\s*(${alt})\\b`, 'gi'))) {
    const ini = s.lastIndexOf('`', m.index)
    const fin = s.indexOf('`', m.index! + m[0].length)
    const trozo = ini >= 0 && fin >= 0 ? s.slice(ini, fin) : s.slice(Math.max(0, m.index! - 200), m.index! + 800)
    if (!sqlFiltraEmpresa(trozo, alt)) {
      const k = ini >= 0 && fin >= 0 ? `${ini}:${fin}` : `${m.index}`
      if (!vistos.has(k)) { vistos.add(k); malas.push(`SQL rrhh.${m[1]}`) }
    }
  }
  // Prisma por modelo (incluye include/relaciones anidadas: el cuerpo entero debe nombrar empresa_id).
  for (const m of s.matchAll(new RegExp(`\\b(?:prisma|tx|db)\\.(${alt})\\.(\\w+)\\(`, 'g'))) {
    const c = cuerpoLlamada(s, m.index! + m[0].length - 1)
    if (!/\bempresa_id\b/.test(c)) malas.push(`prisma.${m[1]}.${m[2]}`)
  }
  return malas
}

const RUTAS_NOMINA = ['app/api/admin/nominas', 'app/api/cron/nominas', 'app/api/cron/reenviar-contabilidad', 'app/admin/nominas', 'app/api/operador/empresas/modulos']
const FICHEROS = [...listar(join(APP, 'lib')), ...RUTAS_NOMINA.flatMap(d => listar(join(APP, d)))]

/** Lecturas que cruzan empresas A PROPÓSITO (antes de saber la empresa, o un cron que recorre todas). Clave exacta. */
const MULTIEMPRESA: Record<string, string> = {
  'lib/acceso-email-repo.ts: SQL rrhh.empleados': 'login del empleado por correo: candidatos en TODAS sus empresas antes de elegir una',
  'lib/modulos-empresa.ts: SQL rrhh.empresa_modulos': 'cron de nóminas: lista las empresas con el módulo en modo calculo',
  'lib/hechos-contabilidad.ts: SQL rrhh.nominas': 'cron reenviar-contabilidad (`candidatasReenvioTodas`): elige las nóminas pendientes de todas las empresas; cada envío va con la empresa_id de SU fila',
}

describe('aislamiento de nóminas/empleados (excepciones exactas)', () => {
  it('cubre lib/ y las rutas de nómina', () => {
    const rel = FICHEROS.map(f => relative(APP, f))
    expect(rel).toContain('lib/nominas.ts')
    expect(rel).toContain('lib/notificar.ts')
    expect(rel).toContain('app/api/cron/nominas/route.ts')
    expect(rel).toContain('app/api/cron/reenviar-contabilidad/route.ts')
    expect(rel.filter(f => f.startsWith('app/api/admin/nominas/')).length).toBeGreaterThanOrEqual(6)
  })

  it('toda sentencia sobre esas tablas filtra por empresa_id', () => {
    const malas = FICHEROS.flatMap(f => sentenciasSinEmpresa(readFileSync(f, 'utf8')).map(x => `${relative(APP, f)}: ${x}`))
    const restantes = [...malas]
    for (const ex of Object.keys(MULTIEMPRESA)) {
      const i = restantes.indexOf(ex)
      expect(i, `Excepción sin uso (bórrala): ${ex}`).toBeGreaterThanOrEqual(0)
      restantes.splice(i, 1)
    }
    expect(restantes, 'Filtra por empresa_id (rrhh_app tiene BYPASSRLS: sin filtro se leen datos de OTRA empresa)').toEqual([])
  })

  it('las rutas /api/admin/nominas/** toman empresa_id SOLO de getSesion()', () => {
    const rutas = listar(join(APP, 'app/api/admin/nominas')).filter(f => f.endsWith('route.ts'))
    const malas: string[] = []
    for (const f of rutas) {
      const s = sinComentarios(readFileSync(f, 'utf8'))
      if (!/await getSesion\(\)/.test(s)) malas.push(`${relative(APP, f)}: no llama a getSesion()`)
      if (/(body|params|searchParams|form|b)\s*(\??\.|\.get\(\s*['"])\s*empresa_?id/i.test(s) || /\[\s*['"]empresa_id['"]\s*\]/.test(s)) {
        malas.push(`${relative(APP, f)}: lee empresa_id de la petición`)
      }
    }
    expect(malas).toEqual([])
  })
})

describe('el cepo se prueba a sí mismo', () => {
  it('detecta SQL y Prisma sin empresa_id; acepta con él', () => {
    expect(sentenciasSinEmpresa('q`SELECT nombre FROM rrhh.empleados WHERE id = ${i}`')).toHaveLength(1)
    expect(sentenciasSinEmpresa('q`SELECT nombre FROM rrhh.empleados WHERE id = ${i} AND empresa_id = ${e}`')).toHaveLength(0)
    expect(sentenciasSinEmpresa('await prisma.nominas.update({ where: { id } , data })')).toHaveLength(1)
    expect(sentenciasSinEmpresa('await prisma.incidencias_mes.findMany({ where: { nomina_id } })')).toHaveLength(1)
    expect(sentenciasSinEmpresa('await prisma.nominas.updateMany({ where: { id, empresa_id } })')).toHaveLength(0)
    expect(sentenciasSinEmpresa('// rrhh.empleados sin filtro en un comentario')).toHaveLength(0)
    // empresa_id solo en el SELECT (o como parámetro mal puesto) NO filtra.
    expect(sentenciasSinEmpresa('q`SELECT n.empresa_id::text AS empresa_id FROM rrhh.nominas n WHERE n.periodo = ${p}`')).toHaveLength(1)
    expect(sentenciasSinEmpresa('q`SELECT n.id FROM rrhh.nominas n WHERE n.id = ${empresa_id}`')).toHaveLength(1)
    // Subconsulta sin su propio filtro: 2 tablas, 1 condición.
    expect(sentenciasSinEmpresa('q`SELECT e.id FROM rrhh.empleados e WHERE e.empresa_id = ${x} AND e.id IN (SELECT n.empleado_id FROM rrhh.nominas n WHERE n.periodo = ${p})`')).toHaveLength(1)
    expect(sentenciasSinEmpresa('q`SELECT e.id FROM rrhh.empleados e WHERE e.empresa_id = ${x} AND e.id IN (SELECT n.empleado_id FROM rrhh.nominas n WHERE n.empresa_id = ${x} AND n.periodo = ${p})`')).toHaveLength(0)
    expect(sentenciasSinEmpresa('q`INSERT INTO rrhh.nominas (id, empresa_id, periodo) VALUES (${a}, ${b}, ${c})`')).toHaveLength(0)
    expect(sentenciasSinEmpresa('q`INSERT INTO rrhh.nominas (id, periodo) VALUES (${a}, ${c})`')).toHaveLength(1)
  })
})
