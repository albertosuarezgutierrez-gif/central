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
//   2. Que nadie consulte el schema `seguros` sin pasar por esa lógica.
//
// ⚠️ La parte estática (2) hoy no encuentra nada que revisar, porque todavía no
// hay modelos: el schema `seguros` está vacío. Es un cepo puesto ANTES de que
// llegue el dump, a propósito — cuando aterricen las 52 tablas, ya está armado.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

// ─── 2. Nadie toca `seguros` por su cuenta ───────────────────────────────────

function ficherosDeAsegura(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/asegura'], { cwd: ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !f.endsWith('tenant.ts') && !f.endsWith('tenant-ambito.ts'))
    // 🚨 `estado-migracion.ts` está exento, y el porqué CAMBIÓ el 01/09/2026:
    // la exención se escribió cuando solo consultaba `information_schema`, pero
    // desde entonces cuenta también `seguros.corredurias` — y el guardián lo
    // cazó en CI (head 063f6596a) mientras el comentario seguía diciendo que
    // «no toca datos de nadie». La razón REAL por la que sigue exento es otra:
    // esa consulta existe justamente para AVERIGUAR si hay corredurías, así que
    // no puede filtrar por una que todavía no se sabe si existe. Es un conteo
    // global, sin PII y sin filas — el único punto del código donde el ámbito
    // no aplica porque el ámbito es lo que se está resolviendo.
    // Si algún día este fichero lee otra tabla de `seguros`, esta exención deja
    // de valer: quítala y hazlo pasar por `lib/tenant`.
    .filter((f) => !f.endsWith('estado-migracion.ts'))
}

// SQL crudo que nombra el schema `seguros` (`from seguros.x`, `join seguros.y`…).
const SQL_SEGUROS = /\bseguros\s*\.\s*[a-z_]/i

/**
 * Quita los COMENTARIOS antes de buscar SQL. Un comentario no consulta nada, y
 * documentar por qué no se cuentan clientes citando `seguros.clientes` marcaba
 * como infractor a un fichero PURO que no toca la base (pasó el 01/09/2026 con
 * `migracion-decision.ts`).
 *
 * Se quitan solo los bloques `/* *\/` y las líneas que EMPIEZAN por `//` o `*`:
 * cortar por un `//` a mitad de línea podría comerse SQL real escrito detrás de
 * una URL, y un cepo que deja pasar es peor que uno que molesta.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n')
}

test('ningún fichero consulta el schema «seguros» sin pasar por el ámbito de correduría', () => {
  const infractores: string[] = []

  for (const f of ficherosDeAsegura()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!SQL_SEGUROS.test(sinComentarios(src))) continue
    // Si toca `seguros.*`, tiene que importar la puerta única.
    // Se acepta con y sin extensión: `allowImportingTsExtensions` está en la
    // tsconfig base y media casa importa como `./x.ts` (ver apps/plataforma).
    // Sin esto, un fichero que SÍ cumple salía marcado como infractor, y el
    // arreglo natural es rodear el guardián — justo lo que no queremos.
    if (!/from ['"](\.\.?\/)*(lib\/)?tenant(\.ts)?['"]|@\/lib\/tenant/.test(src)) {
      infractores.push(f)
    }
  }

  assert.deepEqual(
    infractores,
    [],
    `Estos ficheros consultan el schema «seguros» sin importar el ámbito de correduría ` +
      `(lib/tenant.ts). Con BYPASSRLS eso devuelve los datos de TODAS las corredurías ` +
      `sin dar ningún error:\n  - ${infractores.join('\n  - ')}`,
  )
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
// Un guardián que nunca ha visto un infractor no se sabe si aprieta. Estos dos
// casos fijan las dos mitades: que detecta el SQL de `seguros` y que reconoce el
// import de la puerta única en las dos formas que usa la casa (con y sin `.ts`).

const IMPORTA_TENANT = /from ['"](\.\.?\/)*(lib\/)?tenant(\.ts)?['"]|@\/lib\/tenant/

test('un comentario que NOMBRA el schema no convierte en infractor a un fichero puro', () => {
  const puro = [
    '/**',
    ' * Se cuentan corredurías y no clientes: contar `seguros.clientes` sin filtro',
    ' * sería contar los de TODAS las corredurías.',
    ' */',
    '// también en línea: seguros.polizas',
    'export function decidir(n: number): boolean { return n > 0 }',
  ].join('\n')
  assert.ok(SQL_SEGUROS.test(puro), 'el comentario SÍ menciona el schema')
  assert.ok(!SQL_SEGUROS.test(sinComentarios(puro)), 'pero sin comentarios no queda SQL')
})

test('y el SQL de verdad sigue detectándose aunque haya comentarios alrededor', () => {
  const infractor = [
    '// Este fichero sí consulta la base.',
    "const q = await prisma.$queryRaw`select count(*) from seguros.clientes`",
  ].join('\n')
  assert.ok(SQL_SEGUROS.test(sinComentarios(infractor)), 'el SQL real no se puede escapar')
})

test('el detector de SQL reconoce las formas reales de nombrar el schema', () => {
  for (const src of [
    'from seguros.polizas where 1=1',
    'join seguros.codeoscopic_consumo c on ...',
    'insert into seguros.clientes (a) values (1)',
    'update  seguros . polizas set x = 1',
  ]) {
    assert.ok(SQL_SEGUROS.test(src), `debería detectar: ${src}`)
  }
})

test('reconoce el import del ámbito con y sin extensión .ts, y solo ese', () => {
  for (const bueno of [
    "import { prisma } from './tenant'",
    "import { prisma } from '../tenant.ts'",
    "import { prisma } from '@/lib/tenant'",
    "import { x } from '../../lib/tenant.ts'",
  ]) {
    assert.ok(IMPORTA_TENANT.test(bueno), `debería valer: ${bueno}`)
  }
  for (const malo of [
    "import { prisma } from './db'",
    "import { x } from './tenant-ambito.ts'", // NO es la puerta: no resuelve la sesión
    "import { x } from './mi-tenant-falso'",
  ]) {
    assert.ok(!IMPORTA_TENANT.test(malo), `no debería valer: ${malo}`)
  }
})
