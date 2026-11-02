// Cepos de autorización de crons/webhooks/limpiadoras (02/11/2026). `node --test` (`pnpm test:guardia`).
//
// 1) «Bearer undefined». `auth === \`Bearer ${process.env.CRON_SECRET}\`` con la variable ausente
//    compara contra la cadena literal "Bearer undefined": quien la mande, entra. Además no es tiempo
//    constante. Las rutas usan el helper de su app (`isCronAuthorized` / `bearerCronValido`), que
//    deniega sin secreto en producción y compara con `timingSafeEqual`.
// 2) sivra /api/limpiadoras/*: el middleware (Edge, sin Prisma) solo mira que la cookie
//    `limpiadora_token` EXISTA. Cada handler tiene que validarla en BD con `isLimpiadoraAuthorized()`.
//
// Lee el código fuente (no ejecuta Next): sin Prisma ni envs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')

function rutas(dir: string): string[] {
  const abs = join(RAIZ, dir)
  if (!existsSync(abs)) return []
  const out: string[] = []
  for (const n of readdirSync(abs)) {
    if (n === 'node_modules' || n === '.next') continue
    const p = join(abs, n)
    if (statSync(p).isDirectory()) out.push(...rutas(relative(RAIZ, p)))
    else if (n === 'route.ts') out.push(relative(RAIZ, p))
  }
  return out
}

// Plantilla con CRON_SECRET interpolado en un template literal tras «Bearer ».
const A_PELO = /Bearer \$\{\s*process\.env\.CRON_SECRET\s*\}/

export function rutasConSecretoAPelo(dirs: string[], leer = (f: string) => readFileSync(join(RAIZ, f), 'utf8')): string[] {
  return dirs.flatMap(rutas).filter(f => A_PELO.test(leer(f)))
}

const DIRS_CRON = [
  'apps/sivra/app',
  'apps/ialimp/app',
  'apps/plataforma/app/api/cron',
  'apps/plataforma/app/api/webhooks',
  // seo-refresh / seo-token-check: los dispara el cron con Bearer (02/11/2026).
  'apps/plataforma/app/api/sivra',
]

test('ninguna ruta de sivra/ialimp/plataforma-cron/sivra compara con `Bearer ${process.env.CRON_SECRET}` a pelo', () => {
  assert.deepEqual(rutasConSecretoAPelo(DIRS_CRON), [])
})

test('el detector reconoce la plantilla (si no, el cepo de arriba sería verde por ceguera)', () => {
  const malo = "if (auth !== `Bearer ${process.env.CRON_SECRET}`) {"
  const bueno = 'if (!isCronAuthorized(req)) {'
  assert.equal(A_PELO.test(malo), true)
  assert.equal(A_PELO.test(bueno), false)
})

// ── sivra /api/limpiadoras/* ──────────────────────────────────────────────────────────────────
// `auth` es el propio login (crea el token). `auto-assign` es un cron (CRON_SECRET).
const LIMP_EXENTAS = new Set(['auth', 'auto-assign'])

test('sivra: cada handler de /api/limpiadoras/* valida el token en BD (isLimpiadoraAuthorized)', () => {
  const base = 'apps/sivra/app/api/limpiadoras'
  const sinGuarda: string[] = []
  for (const f of rutas(base)) {
    const seg = relative(join(RAIZ, base), join(RAIZ, f)).split('/')[0]
    if (LIMP_EXENTAS.has(seg)) continue
    const src = readFileSync(join(RAIZ, f), 'utf8')
    // Cada `export async function METODO(...) {` debe llevar la guarda en su cuerpo inmediato.
    const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b[^{]*\{([\s\S]{0,400})/g
    for (const m of src.matchAll(re)) {
      if (!/isLimpiadoraAuthorized\(\)/.test(m[2])) sinGuarda.push(`${f} ${m[1]}`)
    }
  }
  assert.deepEqual(sinGuarda, [])
})

test('sivra: rutas muertas sin auth no vuelven (auto-reply / auto-sessions viven en plataforma)', () => {
  for (const f of [
    'apps/sivra/app/api/mensajes/auto-reply/route.ts',
    'apps/sivra/app/api/limpiadoras/auto-sessions/route.ts',
  ]) assert.equal(existsSync(join(RAIZ, f)), false, f)
  const mw = readFileSync(join(RAIZ, 'apps/sivra/middleware.ts'), 'utf8')
  for (const x of ['api/updates/sync', 'api/pricing/pilot-track', 'api/mensajes/auto-reply', 'api/limpiadoras/auto-sessions']) {
    assert.equal(mw.includes(x), false, `${x} sigue excluido del matcher`)
  }
})
