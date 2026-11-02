// Guardián de aislamiento por empresa en `apps/rrhh` (lote 2 de la auditoría 11/2026). `node --test`.
//
// Portal del Empleado multi-empresa: el rol `rrhh_app` conecta con una sola cadena y las consultas
// van por SQL crudo (`$queryRaw`) o Prisma. Una sentencia sobre una tabla con `empresa_id` que no
// lo filtra devuelve los datos de OTRA empresa sin dar ningún error (nóminas, fichas, documentos).
//
// Regla: toda sentencia (plantilla SQL entre backticks, o llamada `prisma.<modelo>.<método>(…)`)
// sobre una tabla con `empresa_id` debe nombrar `empresa_id` en esa misma sentencia, o estar en la
// allowlist por fichero con su motivo. La lista de tablas sale del DDL (migraciones + schema.prisma).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const RRHH = 'apps/rrhh'

function tablasConEmpresa(): string[] {
  const t = new Set<string>()
  const dir = join(ROOT, RRHH, 'prisma/migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8')
    for (const m of sql.matchAll(/create table (?:if not exists )?(?:rrhh\.)?(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      if (/\bempresa_id\b/.test(m[2])) t.add(m[1])
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:only )?(?:rrhh\.)?(\w+)\s+add column (?:if not exists )?empresa_id\b/gi)) {
      t.add(m[1])
    }
  }
  const prisma = readFileSync(join(ROOT, RRHH, 'prisma/schema.prisma'), 'utf8')
  for (const m of prisma.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    if (/^\s*empresa_id\s/m.test(m[2])) t.add(m[1])
  }
  return [...t]
}

function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

/** Cuerpo de la llamada que abre en `abre` (índice del `(`), con paréntesis equilibrados. */
function cuerpoLlamada(s: string, abre: number): string {
  let d = 0
  for (let i = abre; i < s.length; i++) {
    if (s[i] === '(') d++
    else if (s[i] === ')' && --d === 0) return s.slice(abre, i + 1)
  }
  return s.slice(abre)
}

/** Sentencias de `src` sobre tablas con empresa_id que NO nombran `empresa_id`. */
function sentenciasSinEmpresa(src: string, tablas: string[]): string[] {
  const limpio = sinComentarios(src)
  const alt = [...tablas].sort((a, b) => b.length - a.length).join('|')
  const malas: string[] = []

  // SQL crudo: la plantilla (entre backticks) que contiene `rrhh.<tabla>`.
  const sql = new RegExp(`\\brrhh\\s*\\.\\s*(${alt})\\b`, 'gi')
  for (const m of limpio.matchAll(sql)) {
    const ini = limpio.lastIndexOf('`', m.index)
    const fin = limpio.indexOf('`', m.index + m[0].length)
    const trozo = ini >= 0 && fin >= 0 ? limpio.slice(ini, fin) : limpio.slice(Math.max(0, m.index - 200), m.index + 800)
    if (!/\bempresa_id\b/.test(trozo)) malas.push(`SQL rrhh.${m[1]}`)
  }

  // Prisma: `<cliente>.<modelo>.<método>(…)`.
  const pr = new RegExp(`\\b(?:prisma|tx|db)\\.(${alt})\\.(\\w+)\\(`, 'g')
  for (const m of limpio.matchAll(pr)) {
    const cuerpo = cuerpoLlamada(limpio, m.index + m[0].length - 1)
    if (!/\bempresa_id\b/.test(cuerpo)) malas.push(`prisma.${m[1]}.${m[2]}`)
  }
  return malas
}

function ficheros(): string[] {
  return execFileSync('git', ['ls-files', `${RRHH}/app`, `${RRHH}/lib`, `${RRHH}/middleware.ts`], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
}

/**
 * Ficheros con sentencias sobre tablas con empresa_id que NO la filtran, a propósito.
 * Cada entrada lleva su motivo. Una entrada que ya cumple se rechaza abajo (sin exenciones muertas).
 */
const POR_ID_TRAS_EXIGIR = 'sentencia por id/empleado_id DESPUÉS de que la función valide la empresa (exigeEmpleado/obtener con empresa_id) o con id que ya viene de una fila acotada'
const SIN_FILTRO_A_PROPOSITO: Record<string, string> = {
  // usuarios_rrhh: identidad del responsable (login por email / por id de SESIÓN firmada), no listados por empresa.
  'apps/rrhh/app/admin/empleados/page.tsx': 'nombre del usuario por su id de sesión (usuarios_rrhh)',
  'apps/rrhh/app/api/admin/empleados/[id]/documentos/[docId]/firmar-empresa/route.ts': 'nombre del usuario por su id de sesión (usuarios_rrhh)',
  'apps/rrhh/app/api/operador/empresas/route.ts': 'comprobar si un email ya existe: el email es único GLOBAL (usuarios_rrhh.email @unique)',
  'apps/rrhh/lib/abrir-sesion-responsable.ts': 'rota session_jti del usuario por id (id de login ya autenticado)',
  'apps/rrhh/lib/acceso-password-repo.ts': 'login por email (único global): aún no hay empresa de sesión',
  'apps/rrhh/lib/acceso-responsable-repo.ts': 'login por email (único global): aún no hay empresa de sesión',
  'apps/rrhh/lib/empresas-usuario.ts': 'email del usuario por su id de sesión, para listar SUS empresas',
  'apps/rrhh/lib/tenant.ts': 'rotación de session_jti por id de usuario con compare-and-swap sobre el jti actual',
  // documentos / firmas: el id de documento llega ya validado contra la empresa de la sesión por la ruta.
  'apps/rrhh/app/api/admin/empleados/[id]/documentos/confirm/route.ts': 'UPDATE por doc.id recién insertado con empresa_id en la misma ruta',
  'apps/rrhh/app/api/admin/empleados/[id]/documentos/route.ts': 'UPDATE por doc.id recién insertado con empresa_id en la misma ruta',
  'apps/rrhh/lib/firma-empresa.ts': 'UPDATE por docId tras cargar el documento con empresa_id (revisar: ver informe de auditoría)',
  'apps/rrhh/lib/firma.ts': 'OTP y estado por (docId, empleadoId) del flujo de firma ya autenticado; ids de la sesión del empleado',
  'apps/rrhh/lib/verificacion.ts': 'verificación PÚBLICA por documento_id (UUID no adivinable), SELECT curado sin PII',
  // hilos y listados que primero validan la empresa del empleado.
  'apps/rrhh/lib/chat.ts': POR_ID_TRAS_EXIGIR,
  'apps/rrhh/lib/solicitudes.ts': POR_ID_TRAS_EXIGIR,
  'apps/rrhh/lib/nominas.ts': 'incidencias/nómina por nominaId/incId tras findFirst/obtenerNomina con empresa_id en la misma función',
  'apps/rrhh/lib/material-repo.ts': 'COUNT con el mismo fragmento `where` que ya incluye m.empresa_id (se construye con Prisma.join)',
  'apps/rrhh/lib/push.ts': 'borrar una suscripción caducada por endpoint (410/404 del servicio push)',
  'apps/rrhh/lib/notificar.ts': 'nombreEmpleado(empleadoId) para componer un aviso; el id viene de una fila ya acotada (hueco menor: sin empresa)',
}

test('toda sentencia sobre una tabla con empresa_id en apps/rrhh la filtra (o está en la allowlist con motivo)', () => {
  const tablas = tablasConEmpresa()
  assert.ok(tablas.length >= 8, `se esperaban >=8 tablas con empresa_id y salen ${tablas.length}: ¿cambió el DDL?`)
  const infractores: string[] = []
  for (const f of ficheros()) {
    const malas = sentenciasSinEmpresa(readFileSync(join(ROOT, f), 'utf8'), tablas)
    if (malas.length && !(f in SIN_FILTRO_A_PROPOSITO)) infractores.push(`${f}: ${[...new Set(malas)].join(', ')}`)
  }
  assert.deepEqual(
    infractores,
    [],
    `Sentencias sobre tablas con empresa_id que no la filtran (devuelven datos de OTRA empresa sin error). ` +
      `Filtra por empresa_id o añade el fichero a SIN_FILTRO_A_PROPOSITO con su motivo:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('la allowlist no tiene entradas muertas', () => {
  const tablas = tablasConEmpresa()
  const muertas = Object.keys(SIN_FILTRO_A_PROPOSITO).filter((f) => {
    try {
      return sentenciasSinEmpresa(readFileSync(join(ROOT, f), 'utf8'), tablas).length === 0
    } catch {
      return true
    }
  })
  assert.deepEqual(muertas, [], `Quita de la allowlist (ya cumplen o no existen): ${muertas.join(', ')}`)
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────
const T = ['empleados', 'nominas']

test('detecta SQL sin empresa_id y acepta SQL con él', () => {
  assert.equal(sentenciasSinEmpresa('q`select * from rrhh.empleados where id = ${i}::uuid`', T).length, 1)
  assert.equal(sentenciasSinEmpresa('q`select * from rrhh.empleados where empresa_id = ${e}::uuid and id = ${i}`', T).length, 0)
})

test('detecta Prisma sin empresa_id y acepta Prisma con él; ignora comentarios', () => {
  assert.equal(sentenciasSinEmpresa('await prisma.nominas.findFirst({ where: { id } })', T).length, 1)
  assert.equal(sentenciasSinEmpresa('await prisma.nominas.findFirst({ where: { id, empresa_id } })', T).length, 0)
  assert.equal(sentenciasSinEmpresa('// from rrhh.empleados sin filtro\nconst a = 1', T).length, 0)
})

test('una tabla sin empresa_id no obliga a filtrar', () => {
  assert.equal(sentenciasSinEmpresa('q`select * from rrhh.acceso_otps where ip = ${ip}`', T).length, 0)
})
