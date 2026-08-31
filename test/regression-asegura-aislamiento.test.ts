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
    // `estado-migracion.ts` consulta `information_schema`, no datos de nadie.
    .filter((f) => !f.endsWith('estado-migracion.ts'))
}

// SQL crudo que nombra el schema `seguros` (`from seguros.x`, `join seguros.y`…).
const SQL_SEGUROS = /\bseguros\s*\.\s*[a-z_]/i

test('ningún fichero consulta el schema «seguros» sin pasar por el ámbito de correduría', () => {
  const infractores: string[] = []

  for (const f of ficherosDeAsegura()) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    if (!SQL_SEGUROS.test(src)) continue
    // Si toca `seguros.*`, tiene que importar la puerta única.
    if (!/from ['"](\.\.?\/)*(lib\/)?tenant['"]|@\/lib\/tenant/.test(src)) {
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
