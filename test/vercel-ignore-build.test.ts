// Guardián del "Ignored Build Step" del monorepo (scripts/vercel-ignore-build.mjs).
//
// Este script decide, por EXIT CODE, si cada proyecto Vercel construye o no:
//   exit 1 => CONSTRUIR   ·   exit 0 => SALTAR
//
// Equivocarse cuesta dinero en las dos direcciones, y por eso hay test:
//   - de más   => se reconstruyen las ~10 apps en cada push (el incidente de los
//                 ~600 US$ de Build CPU Minutes, PR #904);
//   - de menos => una app NO se despliega y nadie se entera, que es peor.
//
// Se ejecuta el script de verdad como PROCESO, no una copia de su lógica: lo único
// que Vercel interpreta es el exit code.
//
// OJO CON EL CLON SUPERFICIAL. La primera versión de este fichero minaba el historial
// con `git log -1 -- apps/housesevillana` para encontrar "un commit que toca la app".
// En local funciona; en CI el checkout es SHALLOW (un solo commit), así que ese `git log`
// devolvía el HEAD del PR —que no toca la landing— y el test exigía "construir" a un
// commit que correctamente salta. Peor todavía: los otros casos hacían `return` cuando
// no encontraban commit y se contaban como PASS, es decir, se ponían verdes sin haber
// comprobado nada. Justo el fallo silencioso contra el que existe este PR.
// Ahora: se profundiza el clon primero, y si aun así no hay historia el caso se marca
// SKIP explícito (visible en la salida), nunca como aprobado.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const SCRIPT = 'scripts/vercel-ignore-build.mjs'
const MANIFIESTOS_RAIZ = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']

const git = (args: string[]) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim()
const esSuperficial = () => git(['rev-parse', '--is-shallow-repository']) === 'true'

// CI clona con profundidad 1. Sin historia no se puede comprobar NADA de lo interesante,
// así que se intenta profundizar una vez; si no se puede (sin red), los casos que la
// necesitan se marcan skip en vez de mentir.
function asegurarHistoria(): boolean {
  if (!esSuperficial()) return true
  spawnSync('git', ['fetch', '--unshallow'], { encoding: 'utf8', stdio: 'pipe' })
  return !esSuperficial()
}
const HAY_HISTORIA = asegurarHistoria()

const ficherosDe = (sha: string) =>
  git(['show', '--format=', '--name-only', sha]).split('\n').map((s) => s.trim()).filter(Boolean)

const tienePadre = (sha: string) =>
  spawnSync('git', ['rev-parse', `${sha}^`], { stdio: 'pipe' }).status === 0

// 🚨 Un commit de FUSIÓN no sirve de candidato: `git show --name-only` le lista solo los
// ficheros del conflicto (diff combinado), mientras el script mide `sha^..sha`, que en una
// fusión es TODO lo que trajo la otra rama (p. ej. `pnpm-lock.yaml`). Medido el 02/09/2026
// en el PR #2071: el candidato elegido fue el merge de `main` y el test cayó sin que el
// script se equivocara.
const esFusion = (sha: string) =>
  git(['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/).length > 2

// Busca en el historial reciente un commit cuyos ficheros cumplan `cumple`.
// Solo devuelve commits CON PADRE: sin padre el script no puede sacar el diff y se va
// por el fail-open, que es otro caso distinto (y tiene su propio test).
function buscarCommit(cumple: (f: string[]) => boolean): string | null {
  if (!HAY_HISTORIA) return null
  for (const sha of git(['log', '-200', '--format=%H']).split('\n').filter(Boolean)) {
    if (!tienePadre(sha) || esFusion(sha)) continue
    const files = ficherosDe(sha)
    if (files.length && cumple(files)) return sha
  }
  return null
}

// El script se ejecuta con cwd = Root Directory (apps/<app>), igual que en Vercel.
function correr(
  appDir: string,
  sha: string,
  opts: { flags?: string[]; env?: Record<string, string> } = {},
) {
  const r = spawnSync('node', [`../../${SCRIPT}`, appDir, ...(opts.flags ?? [])], {
    cwd: appDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL_GIT_COMMIT_SHA: sha,
      VERCEL_GIT_COMMIT_MESSAGE: '',
      // Los tests corren fuera de Vercel: sin limpiarlas, una VERCEL_ENV/REF heredada
      // del entorno contaminaría los casos que NO simulan preview.
      VERCEL_ENV: '',
      VERCEL_GIT_COMMIT_REF: '',
      ...(opts.env ?? {}),
    },
  })
  return { construye: r.status === 1, salta: r.status === 0, salida: (r.stdout || '') + (r.stderr || '') }
}

// Nombre npm de cada carpeta de packages/, y quién declara qué.
const nombreDePaquete = (dir: string) =>
  JSON.parse(readFileSync(`packages/${dir}/package.json`, 'utf8')).name as string
const depsCentrales = (ruta: string) => {
  const p = JSON.parse(readFileSync(ruta, 'utf8'))
  return Object.keys({ ...p.dependencies, ...p.devDependencies }).filter((k) => k.startsWith('@central/'))
}

// Un commit que toca UN SOLO package y ningún manifiesto raíz: así la decisión de cada app
// depende del package (o de que el commit toque esa app directamente), y de nada más.
// No se exige que no toque apps/ — casi ningún commit real cumpliría eso, y era la razón
// por la que estos casos se saltaban siempre.
type CommitPaquete = { sha: string; dir: string; apps: string[] }

// Devuelve TODOS los candidatos del historial reciente, no solo el primero: el primero
// puede no servir para un caso concreto (p.ej. toca la única app que consume ese package)
// y quedarse en skip sin necesidad, que es lo que pasó al escribir esto.
function commitsDeUnPaquete(): CommitPaquete[] {
  if (!HAY_HISTORIA) return []
  const out: CommitPaquete[] = []
  for (const sha of git(['log', '-200', '--format=%H']).split('\n').filter(Boolean)) {
    if (!tienePadre(sha) || esFusion(sha)) continue
    const f = ficherosDe(sha)
    if (!f.length || f.some((x) => MANIFIESTOS_RAIZ.includes(x))) continue
    const dirs = [...new Set(f.filter((x) => x.startsWith('packages/')).map((x) => x.split('/')[1]))]
    if (dirs.length !== 1) continue
    out.push({
      sha, dir: dirs[0],
      apps: [...new Set(f.filter((x) => x.startsWith('apps/')).map((x) => x.split('/')[1]))],
    })
  }
  return out
}
const commitDeUnPaquete = (): CommitPaquete | null => commitsDeUnPaquete()[0] ?? null

test('una app SIN dependencias @central no se reconstruye por un cambio en packages/', (t) => {
  assert.deepEqual(
    depsCentrales('apps/housesevillana/package.json'), [],
    'housesevillana ya declara @central/*: este test hay que replantearlo',
  )
  const c = commitDeUnPaquete()
  if (!c) return t.skip(`sin commit de un solo package en el historial (shallow=${esSuperficial()})`)
  if (c.apps.includes('housesevillana')) return t.skip(`${c.sha.slice(0, 7)} toca la propia landing`)

  const r = correr('apps/housesevillana', c.sha)
  assert.ok(r.salta, `la landing no consume nada: NO debe construir por packages/${c.dir} (${c.sha.slice(0, 7)}).\n${r.salida}`)
})

test('la app que SÍ consume el package sigue reconstruyéndose', (t) => {
  const candidatos = commitsDeUnPaquete()
  if (!candidatos.length) return t.skip(`sin commit de un solo package en el historial (shallow=${esSuperficial()})`)

  const apps = readdirSync('apps', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  // Se busca la pareja (commit, app) donde la app DECLARA el package y el commit NO la toca:
  // así lo único que puede hacerla construir es la dependencia, no su propio código.
  for (const c of candidatos) {
    let nombre: string
    try { nombre = nombreDePaquete(c.dir) } catch { continue }
    const consumidora = apps.find((a) => {
      if (c.apps.includes(a)) return false
      try { return depsCentrales(`apps/${a}/package.json`).includes(nombre) } catch { return false }
    })
    if (!consumidora) continue

    const r = correr(`apps/${consumidora}`, c.sha)
    assert.ok(r.construye, `${consumidora} declara ${nombre}: DEBE construir (${c.sha.slice(0, 7)}).\n${r.salida}`)
    return
  }
  t.skip(`ninguna pareja (commit de package, app consumidora no tocada) en ${candidatos.length} candidatos`)
})

test('un cambio en la propia app siempre construye', (t) => {
  // Se VERIFICA que el commit toca de verdad la app, en vez de fiarse de `git log -- ruta`:
  // en un clon superficial ese log devuelve el HEAD toque lo que toque.
  const sha = buscarCommit((f) => f.some((x) => x.startsWith('apps/housesevillana/')))
  if (!sha) return t.skip(`sin commit que toque apps/housesevillana en el historial (shallow=${esSuperficial()})`)

  assert.ok(
    ficherosDe(sha).some((f) => f.startsWith('apps/housesevillana/')),
    `premisa rota: ${sha.slice(0, 7)} no toca apps/housesevillana`,
  )
  const r = correr('apps/housesevillana', sha)
  assert.ok(r.construye, `un commit que toca la propia app DEBE construir (${sha.slice(0, 7)}).\n${r.salida}`)
})

test('todas las apps con vercel.json declaran el ignoreCommand con SU ruta', () => {
  // La clave que evita que cada push reconstruya los ~10 proyectos. Es obligatoria en CADA
  // app (regla del CLAUDE.md raíz) y el argumento debe ser su propia carpeta: copiar el
  // vercel.json de otra app y olvidar cambiar la ruta hace que el filtro mida la app
  // equivocada, que es peor que no tenerlo porque falla en silencio.
  for (const app of readdirSync('apps', { withFileTypes: true }).filter((d) => d.isDirectory())) {
    let vercel: { ignoreCommand?: string }
    try { vercel = JSON.parse(readFileSync(`apps/${app.name}/vercel.json`, 'utf8')) } catch { continue }
    assert.ok(vercel.ignoreCommand, `apps/${app.name}/vercel.json no tiene "ignoreCommand"`)
    assert.match(
      vercel.ignoreCommand,
      new RegExp(`vercel-ignore-build\\.mjs apps/${app.name}( --sin-previews)?\\s*$`),
      `apps/${app.name}: el ignoreCommand no apunta a su propia carpeta → "${vercel.ignoreCommand}"`,
    )
  }
})

test('ialimp CONSERVA sus previews (cliente vivo: preview verde antes de main)', () => {
  const vercel = JSON.parse(readFileSync('apps/ialimp/vercel.json', 'utf8')) as { ignoreCommand?: string }
  assert.ok(
    !/--sin-previews/.test(vercel.ignoreCommand ?? ''),
    'ialimp tiene cliente en producción (Sique Brilla) y su regla es verificar en preview antes de mergear: no debe llevar --sin-previews',
  )
})

// --sin-previews: la mitad de los Build CPU Minutes de la factura eran previews de PRs
// que nadie mira. Con el flag, una rama ≠ main salta SIEMPRE (aunque el diff toque la
// app), salvo [preview] en el asunto. En producción (main) el flag no pinta nada.
test('--sin-previews: una rama de PR que toca la app NO construye su preview', (t) => {
  const sha = buscarCommit((f) => f.some((x) => x.startsWith('apps/housesevillana/')))
  if (!sha) return t.skip(`sin commit que toque apps/housesevillana (shallow=${esSuperficial()})`)
  const r = correr('apps/housesevillana', sha, {
    flags: ['--sin-previews'],
    env: { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'claude/rama-de-pr' },
  })
  assert.ok(r.salta, `con --sin-previews una preview debe saltar aunque el diff toque la app (${sha.slice(0, 7)}).\n${r.salida}`)
})

test('--sin-previews: [preview] en el asunto fuerza la preview (escape)', (t) => {
  const sha = buscarCommit((f) => f.some((x) => x.startsWith('apps/housesevillana/')))
  if (!sha) return t.skip(`sin commit que toque apps/housesevillana (shallow=${esSuperficial()})`)
  const r = correr('apps/housesevillana', sha, {
    flags: ['--sin-previews'],
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'claude/rama-de-pr',
      VERCEL_GIT_COMMIT_MESSAGE: 'fix(landing): probar hero [preview]\n\ncuerpo',
    },
  })
  assert.ok(r.construye, `[preview] en el asunto debe construir la preview (${sha.slice(0, 7)}).\n${r.salida}`)
})

test('--sin-previews: en main (producción) el flag no cambia nada', (t) => {
  const sha = buscarCommit((f) => f.some((x) => x.startsWith('apps/housesevillana/')))
  if (!sha) return t.skip(`sin commit que toque apps/housesevillana (shallow=${esSuperficial()})`)
  const r = correr('apps/housesevillana', sha, {
    flags: ['--sin-previews'],
    env: { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
  })
  assert.ok(r.construye, `producción con diff relevante debe construir con o sin flag (${sha.slice(0, 7)}).\n${r.salida}`)
})

test('--sin-previews: sin variables de Vercel (local/tests) NO se asume preview', (t) => {
  const sha = buscarCommit((f) => f.some((x) => x.startsWith('apps/housesevillana/')))
  if (!sha) return t.skip(`sin commit que toque apps/housesevillana (shallow=${esSuperficial()})`)
  const r = correr('apps/housesevillana', sha, { flags: ['--sin-previews'] })
  assert.ok(r.construye, `sin VERCEL_ENV ni VERCEL_GIT_COMMIT_REF debe seguir el fail-open (${sha.slice(0, 7)}).\n${r.salida}`)
})

test('fail-open: sin argumento de app, construye', () => {
  const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' })
  assert.equal(r.status, 1, `sin argumento debe construir por seguridad.\n${r.stdout}${r.stderr}`)
})

test('fail-open: con un SHA que no existe, construye', () => {
  // El caso del clon superficial en Vercel: si el diff no se puede calcular, se construye.
  const r = correr('apps/housesevillana', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
  assert.ok(r.construye, `un SHA irresoluble debe construir por seguridad.\n${r.salida}`)
})
