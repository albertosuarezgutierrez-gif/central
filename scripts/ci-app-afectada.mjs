#!/usr/bin/env node
/**
 * ¿Este PR toca la app `apps/<app>`? — lo pregunta cada job `Typecheck · <app>`
 * de `tests.yml` ANTES de instalar nada.
 *
 * ── Por qué (23/09/2026) ────────────────────────────────────────────────────
 * El presupuesto de GitHub Actions es de la CUENTA y lo comparten `central` y
 * `asegura`. `central` gastaba ~71.700 min/mes y el 68 % era esta matriz: 13
 * typechecks completos (install + prisma + tsc) en CADA push de PR, aunque el PR
 * tocara una sola app o solo docs. El 22/09 el presupuesto se agotó y la ingesta
 * de CIMA (Actions de `asegura`) pasó ~45 h sin runner.
 *
 * ── 🚨 Por qué no se filtra con `paths:` en el workflow ─────────────────────
 * Los `Typecheck · <app>` son checks REQUERIDOS del ruleset. Un workflow que no
 * arranca deja el check en «Expected» y bloquea el merge. Por eso el job arranca
 * SIEMPRE y solo se salta sus pasos: termina en `success` y el check existe.
 *
 * ── Fail-open ───────────────────────────────────────────────────────────────
 * Ante cualquier duda —sin base, diff que falla, package ilegible, fichero de
 * raíz desconocido— la respuesta es «sí, afecta». Saltarse un typecheck que
 * hacía falta es un fallo que llega a producción; hacer uno de más son 90 s.
 *
 * Uso:  node scripts/ci-app-afectada.mjs apps/<app> HEAD^1
 *   En `pull_request`, `actions/checkout` deja en HEAD el commit de MERGE del PR
 *   sobre su base; con `fetch-depth: 2`, `HEAD^1` es la base y el diff son
 *   exactamente los cambios del PR.
 * Escribe `afecta=true|false` en $GITHUB_OUTPUT (si existe) y el motivo por stdout.
 *
 * ⚠️ El cierre de dependencias `@central/*` repite la lógica de
 * `vercel-ignore-build.mjs` a propósito: aquel lo ejecuta Vercel en cada build y
 * no se toca para reutilizarlo desde aquí.
 */
import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'

/** Prefijos que NO afectan al typecheck de ninguna app (ni a su tsconfig). */
const NEUTROS = ['docs/', '.claude/', 'test/']

/**
 * Regla pura. `consumidos`/`conocidos` = carpetas de `packages/`; `null` = no se
 * pudo resolver, y entonces cualquier cambio en `packages/` cuenta.
 */
export function appAfectada(cambios, appDir, consumidos, conocidos) {
  if (!Array.isArray(cambios) || cambios.length === 0) return { afecta: true, motivo: 'diff vacío o desconocido' }
  for (const f of cambios) {
    if (f.startsWith(appDir + '/')) return { afecta: true, motivo: `toca ${f}` }
    if (f.startsWith('apps/')) continue
    if (f.startsWith('packages/')) {
      const dir = f.split('/')[1]
      if (consumidos === null || conocidos === null || !dir || !conocidos.has(dir) || consumidos.has(dir)) {
        return { afecta: true, motivo: `toca ${f} (package que consume o no resoluble)` }
      }
      continue
    }
    if (NEUTROS.some((p) => f.startsWith(p))) continue
    if (!f.includes('/') && f.endsWith('.md')) continue
    // Manifiestos raíz, workflows, scripts, tsconfig base… cualquier otra cosa: afecta.
    return { afecta: true, motivo: `toca ${f} (fuera de apps/packages/docs)` }
  }
  return { afecta: false, motivo: `ningún cambio en ${appDir} ni en sus packages (${cambios.length} fichero(s))` }
}

function cierre(raiz, appDir) {
  const porDir = new Map()
  for (const d of readdirSync(`${raiz}/packages`, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    try {
      const pkg = JSON.parse(readFileSync(`${raiz}/packages/${d.name}/package.json`, 'utf8'))
      if (pkg.name) porDir.set(d.name, pkg.name)
    } catch { /* ilegible: fuera de `conocidos` → cuenta como relevante */ }
  }
  const dirDe = new Map([...porDir].map(([d, n]) => [n, d]))
  const deps = (ruta) => {
    const pkg = JSON.parse(readFileSync(ruta, 'utf8'))
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((k) => k.startsWith('@central/'))
  }
  const vistos = new Set()
  const cola = deps(`${raiz}/${appDir}/package.json`)
  while (cola.length) {
    const n = cola.pop()
    if (vistos.has(n)) continue
    vistos.add(n)
    const dir = dirDe.get(n)
    if (dir) try { cola.push(...deps(`${raiz}/packages/${dir}/package.json`)) } catch { /* ilegible */ }
  }
  return {
    conocidos: new Set(porDir.keys()),
    consumidos: new Set([...porDir].filter(([, n]) => vistos.has(n)).map(([d]) => d)),
  }
}

function salir(r) {
  console.log(`${r.afecta ? '▶ typecheck' : '⏭ salto'}: ${r.motivo}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `afecta=${r.afecta}\n`)
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const appDir = (process.argv[2] || '').replace(/\/+$/, '')
  const base = process.argv[3] || ''
  if (!appDir || !base) salir({ afecta: true, motivo: 'sin app o sin base (push a main, dispatch…)' })
  let cambios
  try {
    cambios = execSync(`git diff --name-only ${base} HEAD`, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean)
  } catch (e) {
    salir({ afecta: true, motivo: `no se pudo calcular el diff contra ${base}` })
  }
  let consumidos = null
  let conocidos = null
  try {
    if (existsSync('packages')) ({ consumidos, conocidos } = cierre('.', appDir))
  } catch { /* fail-open */ }
  salir(appAfectada(cambios, appDir, consumidos, conocidos))
}
