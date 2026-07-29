// Guardián de alcanzabilidad de las rutinas. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// EL FALLO QUE PREVIENE (incidente 26-27/07/2026): en plataforma la autorización de las rutinas
// de Claude Code vive en el HANDLER (`isRoutineAuthorized` → acepta `ALERTA_TOKEN`), pero el
// middleware de sesión sólo dejaba pasar el `CRON_SECRET` maestro. Un endpoint podía por tanto
// aceptar `ALERTA_TOKEN` en su código y ser IGUALMENTE inalcanzable: el middleware lo redirigía
// 307 → /login antes de que el handler corriera. Las excepciones se añadían a mano a `PUBLIC` y
// olvidarse era invisible — el agente de pricing estuvo 3 ciclos bloqueado (20/07, 22/07, 27/07)
// con el diagnóstico equivocado ("falta CRON_SECRET") mientras el handler ya estaba abierto.
//
// Este test cierra el círculo en las DOS direcciones:
//  1. Todo handler que autentique rutinas debe ser ALCANZABLE por una (declarado en
//     `RUTAS_RUTINA`, o exento por `PUBLIC`). Si no, es código muerto que falla en producción.
//  2. Toda entrada de `RUTAS_RUTINA` debe corresponder a un handler real que las autentique. Si no,
//     se está ampliando gratis la superficie de un token que viaja en texto plano en el entorno de
//     las rutinas.
//
// «Autenticar rutinas» = usar `isRoutineAuthorized` (token de rutina o CRON_SECRET) o
// `isAlertaTokenAuthorized` a pelo (autorización escalonada, como `/api/sivra/pricing/aplicar-propuesta`,
// que con el token de rutina sólo permite dry-run). Las dos formas las alcanza una rutina.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/plataforma'
const AUTENTICA_RUTINAS = /isRoutineAuthorized|isAlertaTokenAuthorized/

function leer(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/** Extrae los literales de cadena de un array `const <nombre> ... = [ ... ]`. */
function literalesDeArray(fuente: string, nombre: string): string[] {
  const m = new RegExp(`const ${nombre}[^=]*=\\s*\\[([\\s\\S]*?)\\]`).exec(fuente)
  assert.ok(m, `no se encontró el array ${nombre} — ¿lo han renombrado?`)
  // Sólo las cadenas: los comentarios de esas listas no llevan comillas simples/dobles.
  return [...m[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((x) => x[1] ?? x[2])
}

/** `apps/plataforma/app/api/x/y/route.ts` → `/api/x/y` (sin grupos `(usuario)`). */
function rutaDeArchivo(archivo: string): string {
  return archivo
    .replace(`${APP}/app`, '')
    .replace(/\/route\.tsx?$/, '')
    .split('/')
    .filter((seg) => !(seg.startsWith('(') && seg.endsWith(')')))
    .join('/')
}

function handlersDeRutina(): string[] {
  const out = execFileSync('git', ['ls-files', `${APP}/app`], { cwd: ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .filter((f) => /\/route\.tsx?$/.test(f))
    .filter((f) => AUTENTICA_RUTINAS.test(leer(f)))
}

test('todo handler que autentica rutinas es alcanzable por una rutina', () => {
  const declaradas = literalesDeArray(leer(`${APP}/lib/rutas-rutina.ts`), 'RUTAS_RUTINA')
  const publicas = literalesDeArray(leer(`${APP}/middleware.ts`), 'PUBLIC')
  const alcanzables = [...declaradas, ...publicas]

  const huerfanos = handlersDeRutina()
    .map((f) => ({ archivo: f, ruta: rutaDeArchivo(f) }))
    .filter(({ ruta }) => !alcanzables.some((p) => ruta.startsWith(p)))

  assert.deepEqual(
    huerfanos.map((h) => h.archivo),
    [],
    'Estos handlers aceptan el token de rutina pero el middleware los redirige a /login antes de ' +
      'correr → la rutina recibe 307/401 y el fallo es mudo. Añade su ruta a ' +
      `${APP}/lib/rutas-rutina.ts (RUTAS_RUTINA).`,
  )
})

test('RUTAS_RUTINA no declara rutas sin handler de rutina detrás', () => {
  const declaradas = literalesDeArray(leer(`${APP}/lib/rutas-rutina.ts`), 'RUTAS_RUTINA')
  const rutas = handlersDeRutina().map(rutaDeArchivo)

  const sobrantes = declaradas.filter((p) => !rutas.some((r) => r.startsWith(p)))

  assert.deepEqual(
    sobrantes,
    [],
    'Estas rutas abren el paso a ALERTA_TOKEN sin que ningún handler lo acepte. El token viaja en ' +
      'texto plano en el entorno de las rutinas: no amplíes su superficie sin necesidad.',
  )
})
