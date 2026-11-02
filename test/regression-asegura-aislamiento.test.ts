// Guardián del aislamiento por correduría en `apps/asegura`. `node --test`
// (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// El CRM de origen aísla los datos con 86 políticas RLS resueltas por
// `auth.uid()` de Supabase Auth. Esta app usa cookie propia y conecta con el rol
// `prisma_seguros`, que tiene BYPASSRLS. Al re-plataformar la auth, esas
// políticas se quedan sin sujeto y **dejan de aplicar**.
//
// El modo de fallo NO es «no se ve nada» —eso se nota enseguida— sino «se ve
// TODO y ninguna consulta falla». Es el fallo más caro que hay: una pantalla
// que responde 200 con los datos de otra correduría.
//
// Este guardián fija las dos mitades de la defensa:
//   1. Que la lógica de ámbito distinga TRES estados y no invente un valor.
//   2. Que ninguna consulta SQL sobre una tabla multi-tenant de `seguros` omita `correduria_id`
//      (o el fichero use `correduriaUnica()`). Ver la sección 2.
//
// Las 52+ tablas ya están en el schema: la parte estática (2) revisa el SQL crudo real.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolverAmbito, exigirCorreduriaId } from '../apps/asegura/lib/tenant-ambito.ts'

const ROOT = join(import.meta.dirname, '..')

// ─── 1. La lógica de ámbito ──────────────────────────────────────────────────

test('sin migrar, el ámbito es «pendiente» — no «sin correduría»', () => {
  const a = resolverAmbito({ cuentaId: 'c1', migrado: false, correduriaId: null })
  assert.equal(a.estado, 'pendiente')
})

test('sin migrar es «pendiente» AUNQUE venga un correduriaId: el dato no es fiable todavía', () => {
  const a = resolverAmbito({ cuentaId: 'c1', migrado: false, correduriaId: 'cor-1' })
  assert.equal(a.estado, 'pendiente')
})

test('migrado y sin vínculo es «sin-asignar» — esto SÍ es una ausencia comprobada', () => {
  const a = resolverAmbito({ cuentaId: 'c1', migrado: true, correduriaId: null })
  assert.equal(a.estado, 'sin-asignar')
})

test('migrado y con vínculo devuelve el correduriaId', () => {
  const a = resolverAmbito({ cuentaId: 'c1', migrado: true, correduriaId: 'cor-1' })
  assert.deepEqual(a, { estado: 'ok', cuentaId: 'c1', correduriaId: 'cor-1' })
})

test('los valores centinela NO cuentan como correduría (un «desconocido» no es un dato)', () => {
  for (const v of ['', '  ', 'otro', 'DESCONOCIDO', 'N/A', 'sin asignar', 'null']) {
    const a = resolverAmbito({ cuentaId: 'c1', migrado: true, correduriaId: v })
    assert.equal(a.estado, 'sin-asignar', `«${v}» debería tratarse como ausencia`)
  }
})

test('exigirCorreduriaId LANZA salvo en «ok» — nunca devuelve un valor de relleno', () => {
  assert.throws(() => exigirCorreduriaId({ estado: 'pendiente' }))
  assert.throws(() => exigirCorreduriaId({ estado: 'sin-asignar', cuentaId: 'c1' }))
  assert.equal(
    exigirCorreduriaId({ estado: 'ok', cuentaId: 'c1', correduriaId: 'cor-1' }),
    'cor-1',
  )
})

// ─── 2. Nadie lee una tabla multi-tenant de `seguros` sin acotarla ───────────
//
// La garantía REAL no es el import de `lib/tenant` (solo re-exporta Prisma): es una de
// estas dos cosas, por consulta o por fichero:
//   a) el SQL crudo filtra/escribe `correduria_id` (en la misma plantilla SQL), o
//   b) el fichero usa `correduriaUnica()` de `lib/cartera.ts`, que LANZA si hay más de una
//      correduría en la base (el ámbito deja de poder ser implícito).
// Lo que se prohíbe es una sentencia sobre una tabla con `correduria_id` que no hace ni a)
// ni b): con BYPASSRLS devolvería los datos de TODAS las corredurías sin ningún error.

function ficherosDeAsegura(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/asegura'], { cwd: ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.endsWith('.test.ts'))
}

/** Tablas de `seguros` con columna `correduria_id` (DDL en prisma/sql + modelos Prisma). */
function tablasMultiTenant(): string[] {
  const tablas = new Set<string>()
  const dirSql = join(ROOT, 'apps/asegura/prisma/sql')
  for (const f of readdirSync(dirSql).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(join(dirSql, f), 'utf8')
    for (const m of sql.matchAll(/create table (?:if not exists )?seguros\.(\w+)\s*\(([\s\S]*?)\n\)\s*;/gi)) {
      if (m[2].includes('correduria_id')) tablas.add(m[1])
    }
  }
  const prisma = readFileSync(join(ROOT, 'apps/asegura/prisma/asegura.prisma'), 'utf8')
  for (const m of prisma.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    if (!/correduria_id|correduriaId/.test(m[2])) continue
    tablas.add(/@@map\("(\w+)"\)/.exec(m[2])?.[1] ?? m[1])
  }
  return [...tablas]
}

/**
 * Quita los COMENTARIOS antes de buscar SQL (un comentario no consulta nada). Solo bloques
 * `/* *\/` y líneas que EMPIEZAN por `//` o `*`: cortar por un `//` a mitad de línea podría
 * comerse SQL real escrito detrás de una URL, y un cepo que deja pasar es peor que uno que molesta.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

const USA_CORREDURIA_UNICA = /\bcorreduriaUnica\s*\(/

/**
 * Nº de referencias a tablas multi-tenant cuya plantilla SQL (entre backticks) NO menciona
 * `correduria_id`. Si el fichero usa `correduriaUnica()`, la garantía es del fichero: 0.
 */
function referenciasSinAmbito(src: string, tablas: string[]): number {
  const limpio = sinComentarios(src)
  if (USA_CORREDURIA_UNICA.test(limpio)) return 0
  const ref = new RegExp(
    `\\bseguros\\s*\\.\\s*(${[...tablas].sort((a, b) => b.length - a.length).join('|')})\\b`,
    'gi',
  )
  let n = 0
  for (const m of limpio.matchAll(ref)) {
    const ini = limpio.lastIndexOf('`', m.index)
    const fin = limpio.indexOf('`', m.index + m[0].length)
    const trozo =
      ini >= 0 && fin >= 0 ? limpio.slice(ini, fin) : limpio.slice(Math.max(0, m.index - 200), m.index + 800)
    if (!trozo.includes('correduria_id')) n++
  }
  return n
}

/**
 * Ficheros con sentencias sobre tablas multi-tenant SIN `correduria_id` a propósito. Cada
 * entrada lleva su motivo; un fichero nuevo aquí exige justificarlo en la revisión.
 * Todas son sentencias por clave primaria/uuid de una fila que el propio fichero ya obtuvo
 * acotada por correduría (UPDATE/DELETE por `id`, EXISTS/JOIN por FK de esa fila), o la
 * correduría viaja en un parámetro de la misma función. Si un fichero deja de necesitar la
 * excepción, el test de abajo exige quitarla (no se acumulan exenciones muertas).
 */
const SIN_FILTRO_A_PROPOSITO: Record<string, string> = {
  'apps/asegura/lib/codeoscopic/consumo.ts':
    'cerrar/descartar el consumo se hace por intento_id (uuid único del intento ya reservado con correduria_id)',
  'apps/asegura/lib/tarificador-codigo-sms.ts':
    'lee/actualiza por id de sesión/código ya resuelto desde una fila acotada por correduría',
  'apps/asegura/lib/tarificador-emision.ts':
    'transiciones de estado por id de trabajo ya cargado con correduria_id; los pasos cuelgan por trabajo_id',
  'apps/asegura/lib/tarificador-explorador.ts':
    'pasos de una exploración por exploracion_id ya acotada por correduría',
  'apps/asegura/lib/tarificador-formador.ts':
    'filas hijas por trabajo_id/ficha_id ya acotadas por correduría',
  'apps/asegura/lib/tarificador-grabaciones.ts':
    'pantallas de una grabación por grabacion_id; el fichero usa además correduria_id en las lecturas por tenant',
  'apps/asegura/lib/tarificador-humo.ts': 'informe por id del trabajo de humo ya creado con correduria_id',
  'apps/asegura/lib/tarificador-purga.ts':
    'subconsultas EXISTS/UPDATE por id de trabajo o documento ya seleccionados con correduria_id en su misma pasada',
  'apps/asegura/lib/tarificador-robustez.ts':
    'UPDATE por id de trabajo en máquina de estados; el listado inicial sí filtra por correduria_id',
  'apps/asegura/lib/tarificador.ts':
    'UPDATE/lecturas por id de trabajo o paso ya acotados; las altas y listados filtran por correduria_id',
}

test('toda sentencia SQL sobre una tabla multi-tenant de «seguros» filtra correduria_id (o el fichero usa correduriaUnica)', () => {
  const tablas = tablasMultiTenant()
  assert.ok(tablas.length > 40, `se esperaban >40 tablas multi-tenant y salen ${tablas.length}: ¿cambió el DDL?`)
  const infractores: string[] = []
  for (const f of ficherosDeAsegura()) {
    const n = referenciasSinAmbito(readFileSync(join(ROOT, f), 'utf8'), tablas)
    if (n > 0 && !(f in SIN_FILTRO_A_PROPOSITO)) infractores.push(`${f} (${n} sentencia/s)`)
  }
  assert.deepEqual(
    infractores,
    [],
    `Estos ficheros consultan una tabla de «seguros» con correduria_id SIN filtrarla ni usar ` +
      `correduriaUnica(). Con BYPASSRLS eso devuelve los datos de TODAS las corredurías sin dar ` +
      `ningún error. Filtra por correduria_id o, si es una operación por id de una fila ya acotada, ` +
      `añádelo a SIN_FILTRO_A_PROPOSITO con su motivo:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('la lista de excepciones no tiene entradas muertas', () => {
  const tablas = tablasMultiTenant()
  const muertas = Object.keys(SIN_FILTRO_A_PROPOSITO).filter((f) => {
    try {
      return referenciasSinAmbito(readFileSync(join(ROOT, f), 'utf8'), tablas) === 0
    } catch {
      return true
    }
  })
  assert.deepEqual(muertas, [], `Quita de SIN_FILTRO_A_PROPOSITO (ya cumplen o no existen): ${muertas.join(', ')}`)
})

test('el resolvedor de ámbito no tiene una correduría por defecto', () => {
  const src = readFileSync(join(ROOT, 'apps/asegura/lib/tenant-ambito.ts'), 'utf8')
  assert.ok(
    !/correduriaId\s*(\?\?|\|\|)\s*['"][^'"]/.test(src),
    'tenant-ambito.ts no debe tener un fallback literal para correduriaId: ' +
      'un id inventado no da error, da los datos de otro.',
  )
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

const TABLAS = ['clientes', 'polizas']

test('un comentario que NOMBRA la tabla no convierte en infractor a un fichero puro', () => {
  const puro = [
    '/**',
    ' * contar `seguros.clientes` sin filtro sería contar los de TODAS las corredurías.',
    ' */',
    '// también en línea: seguros.polizas',
    'export function decidir(n: number): boolean { return n > 0 }',
  ].join('\n')
  assert.equal(referenciasSinAmbito(puro, TABLAS), 0)
})

test('SQL sin correduria_id se detecta; con filtro o con correduriaUnica() pasa', () => {
  const sin = "const q = await prisma.$queryRaw`select * from seguros.clientes where id = ${id}::uuid`"
  const con =
    "const q = await prisma.$queryRaw`select * from seguros.clientes where correduria_id = ${c}::uuid and id = ${id}::uuid`"
  const unica = "const c = await correduriaUnica()\n" + sin
  assert.equal(referenciasSinAmbito(sin, TABLAS), 1)
  assert.equal(referenciasSinAmbito(con, TABLAS), 0)
  assert.equal(referenciasSinAmbito(unica, TABLAS), 0)
})

test('un fichero con una consulta filtrada y otra NO filtrada sigue marcado (se mira cada sentencia)', () => {
  const mixto = [
    'await db.$queryRaw`select 1 from seguros.clientes where correduria_id = ${c}::uuid`',
    'await db.$queryRaw`select 1 from seguros.polizas where numero = ${n}`',
  ].join('\n')
  assert.equal(referenciasSinAmbito(mixto, TABLAS), 1)
})

test('una tabla que no es multi-tenant no obliga a filtrar', () => {
  assert.equal(referenciasSinAmbito('db.$queryRaw`select * from seguros.corredurias`', TABLAS), 0)
})
