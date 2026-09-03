// Guardián del MODO SIMULACIÓN de Codeoscopic. `node --test` (gate en CI).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Con `CODEOSCOPIC_SIMULACION=true` la app enseña precios que NO ha dado ninguna
// compañía: se los inventa `lib/codeoscopic/simulacion.ts` para poder ver la
// pantalla entera sin gastar los 0,50€ de cada cotización real.
//
// Eso es útil y es peligroso a la vez, así que un precio simulado tiene que ser
// **imposible de confundir con uno real**, y no de palabra sino en el dato.
// Cuatro condiciones, una sección de este fichero por cada una:
//
//   1. Va MARCADO en el objeto que devuelve el embudo (`simulado`, booleano).
//   2. NO entra en el libro de consumo: no reserva, no cierra, no gasta tope.
//   3. NO alimenta ninguna estimación ni estadística posterior.
//   4. NO puede salir hacia un cliente: solo se sirve con el interruptor del
//      SERVIDOR puesto, jamás con un parámetro de la petición.
//
// El modo de fallo que este cepo persigue no es un bug de lógica: es que la
// marca se pierda por el camino (una capa que la deja de propagar, una rama que
// devuelve el objeto sin ella) y un precio inventado acabe delante de alguien
// como si se lo hubiera dado su compañía. Eso no da error: da una oferta falsa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { simulacionActiva, ENV_SIMULACION } from '../apps/asegura/lib/codeoscopic/config.ts'
import { cotizacionSimulada, MARCA_SIMULACION } from '../apps/asegura/lib/codeoscopic/simulacion.ts'

const ROOT = join(import.meta.dirname, '..')
const FUENTE = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/**
 * El fichero SIN comentarios. Lo que se persigue aquí es CÓDIGO: nombrar la
 * variable del interruptor o la tabla del libro en un comentario es documentar,
 * no crear un segundo camino. (Recorta también lo que vaya tras `//` dentro de
 * una cadena — una URL, p. ej. —, y da igual: aquí solo se buscan identificadores.)
 */
function codigo(f: string): string {
  return FUENTE(f)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function ficheros(patron: RegExp): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/asegura'], { cwd: ROOT, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).filter((f) => patron.test(f))
}

const COTIZAR_TS = 'apps/asegura/lib/codeoscopic/cotizar.ts'
const CONFIG_TS = 'apps/asegura/lib/codeoscopic/config.ts'
const SIMULACION_TS = 'apps/asegura/lib/codeoscopic/simulacion.ts'

/** El cuerpo de `cotizar()`, que es donde vive el orden de los pasos. */
function cuerpoDeCotizar(): string {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('export async function cotizar(')
  assert.ok(i > 0, 'no se encuentra cotizar(): o se ha movido el embudo, o el cepo se quedó ciego')
  return src.slice(i)
}

/** ¿Aparece `aguja` antes que TODAS las de `despues` dentro de `src`? */
function apareceAntesQue(src: string, aguja: string, despues: string[]): boolean {
  const i = src.indexOf(aguja)
  if (i < 0) return false
  return despues.every((d) => {
    const j = src.indexOf(d)
    return j < 0 || i < j
  })
}

// ─── 4 — El interruptor sale del SERVIDOR, nunca de la petición ──────────────

test('el interruptor solo se enciende con el literal "true" del entorno', () => {
  assert.equal(simulacionActiva({}), false, 'apagado por defecto')
  assert.equal(simulacionActiva({ [ENV_SIMULACION]: '1' }), false)
  assert.equal(simulacionActiva({ [ENV_SIMULACION]: 'TRUE' }), false)
  assert.equal(simulacionActiva({ [ENV_SIMULACION]: 'si' }), false)
  assert.equal(simulacionActiva({ [ENV_SIMULACION]: '' }), false)
  assert.equal(simulacionActiva({ [ENV_SIMULACION]: 'true' }), true)
})

test('la variable del interruptor se lee en UN solo sitio: config.ts', () => {
  const infractores = ficheros(/^apps\/asegura\/.*\.(ts|tsx)$/)
    .filter((f) => !f.endsWith('.test.ts') && f !== CONFIG_TS)
    .filter((f) => codigo(f).includes(ENV_SIMULACION))
  assert.deepEqual(
    infractores,
    [],
    `${ENV_SIMULACION} solo se lee en ${CONFIG_TS}. Leerla suelta en otro sitio crea un ` +
      `segundo interruptor que se olvidará de apagar:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('NINGUNA petición puede pedir simulación: no se lee del cuerpo ni del query', () => {
  // Si un parámetro pudiera encender el modo, cualquiera podría hacer que la app
  // enseñara precios inventados a un cliente.
  const DESDE_LA_PETICION =
    /(searchParams\.get\(\s*['"][^'"]*simul|(?:cuerpo|body|params|req|request|payload|json)\s*[.?]\s*\w*[sS]imul)/i
  const infractores = ficheros(/^apps\/asegura\/.*\.(ts|tsx)$/)
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => DESDE_LA_PETICION.test(codigo(f)))
  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros parecen leer la simulación de la petición del cliente, y eso la saca del ' +
      `control del servidor:\n  - ${infractores.join('\n  - ')}`,
  )
})

test('el embudo no acepta un "simulado" en su petición: solo mira el entorno', () => {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('export type PeticionCotizacion')
  const tipo = src.slice(i, src.indexOf('\n}', i))
  assert.ok(!/simul/i.test(tipo), 'PeticionCotizacion no puede traer un campo de simulación')
  // Y la decisión se toma sobre `env`, que es el objeto de entorno del servidor.
  assert.ok(
    /simulacionActiva\(\s*env\s*\)/.test(cuerpoDeCotizar()),
    'la rama de simulación tiene que decidirse con simulacionActiva(env)',
  )
})

// ─── 1 — Va MARCADA en el objeto que devuelve el embudo ──────────────────────

test('el resultado del embudo lleva la marca como CAMPO, no como texto', () => {
  const src = FUENTE(COTIZAR_TS)
  const i = src.indexOf('export type ResultadoCotizacion')
  const tipo = src.slice(i, src.indexOf('| { ok: false', i))
  assert.ok(
    /\bsimulado:\s*boolean\b/.test(tipo),
    'ResultadoCotizacion (rama ok) tiene que declarar `simulado: boolean`',
  )
  const cuerpo = cuerpoDeCotizar()
  assert.ok(/simulado:\s*true/.test(cuerpo), 'la rama simulada devuelve simulado: true')
  assert.ok(
    /simulado:\s*false/.test(cuerpo),
    'la rama REAL devuelve simulado: false explícito — que falte el campo no puede ser la ' +
      'forma de decir «es real»',
  )
})

test('la marca no se pierde por el camino: quien redacta la respuesta, la devuelve', () => {
  // 03/09/2026: la respuesta de la retarificación ya no se redacta dentro de la
  // ruta. Al unificar la correduría en `plataforma` → `/correduria` la misma
  // operación se sirve por dos puertas (sesión de asegura y
  // `/api/operador/codeoscopic/retarificar`) y el payload se extrajo a
  // `lib/retarificar-cartera.ts` para que las dos manden EXACTAMENTE lo mismo.
  //
  // Así que el cepo ya no persigue «quien llama a cotizar()» sino **quien
  // convierte un `ResultadoCotizacion` en respuesta**, que es donde la marca se
  // puede perder. Se reconoce por leer `r.cotizacion`: si alguien redacta un
  // payload a partir del resultado del embudo, tiene que propagar `simulado`.
  const redactores = ficheros(/^apps\/asegura\/(app|lib)\/.*\.tsx?$/).filter((f) =>
    /\br\.cotizacion\b/.test(FUENTE(f)),
  )
  assert.ok(
    redactores.length > 0,
    'nadie redacta una respuesta a partir de una cotización: el cepo se ha quedado ciego',
  )
  const mudos = redactores.filter((f) => !/simulado:\s*r\.simulado/.test(FUENTE(f)))
  assert.deepEqual(
    mudos,
    [],
    'Estos ficheros convierten una cotización en respuesta pero no propagan `simulado`: la ' +
      `pantalla no puede distinguir un precio inventado de uno real:\n  - ${mudos.join('\n  - ')}`,
  )
})

test('la cotización simulada se delata sola en el dato, no solo en la prosa', () => {
  const c = cotizacionSimulada({ effectiveDate: '2026-10-01', risk: { floorArea: 76, yearBuilt: 1994 } })
  // projectId negativo: los de Codeoscopic son enteros positivos.
  assert.ok(Number(c.projectId) < 0, `projectId simulado no negativo: ${c.projectId}`)
  assert.ok(c.precios.length > 0, 'una simulación sin precios no sirve para ver la pantalla')
  for (const p of c.precios) {
    // Ni uno «firme»: un precio inventado no puede presentarse como cerrado.
    assert.equal(p.firmeza, 'estimado', `${p.producto} salió ${p.firmeza}`)
    assert.ok(p.avisos.some((a) => a.includes(MARCA_SIMULACION)), `${p.producto} sin la marca`)
  }
  assert.ok(c.fallos.length > 0, 'la simulación tiene que ejercitar también el caso feo')
})

// ─── 2 y 3 — Ni libro de consumo, ni estadística ─────────────────────────────

test('la simulación se decide ANTES de tocar el libro, el tope o el vendor', () => {
  const cuerpo = cuerpoDeCotizar()
  assert.ok(
    apareceAntesQue(cuerpo, 'simulacionActiva(env)', [
      'consumoActual(',
      'puedeCotizar(',
      'reservar(',
      'await peticion(',
      'cerrarFacturable(',
    ]),
    'La rama de simulación tiene que ir la PRIMERA. Si va después de leer el libro o de ' +
      'reservar, una simulación gastaría cupo del tope sin haber costado nada.',
  )
})

test('la rama simulada RETORNA: no cae al camino que paga', () => {
  const cuerpo = cuerpoDeCotizar()
  const i = cuerpo.indexOf('if (simulacionActiva(env)) {')
  assert.ok(i > 0, 'no se encuentra la guarda de simulación')
  const rama = cuerpo.slice(i, cuerpo.indexOf('\n  }', i))
  assert.ok(/\breturn\b/.test(rama), 'la rama simulada tiene que devolver ahí mismo')
  for (const prohibido of ['reservar(', 'consumoActual(', 'cerrarFacturable(', 'cerrarDescartado(', 'peticion(']) {
    assert.ok(
      !rama.includes(prohibido),
      `la rama simulada no puede llamar a ${prohibido}: no ha costado nada que anotar`,
    )
  }
  assert.ok(
    /restantesHoy:\s*null/.test(rama),
    'restantesHoy tiene que ser null al simular: no se ha mirado el libro, y un número ' +
      'ahí sería inventar cupo consumido (NULL ≠ 0)',
  )
})

test('el generador de simulaciones no conoce ni el libro ni el vendor', () => {
  const src = FUENTE(SIMULACION_TS)
  for (const prohibido of ['./consumo', './contador', './cliente', '../tenant', '../db', 'prisma']) {
    assert.ok(
      !src.includes(prohibido),
      `simulacion.ts no puede tocar «${prohibido}»: es un generador puro, sin BD ni red`,
    )
  }
  // Y entra por la MISMA puerta que la respuesta real: si el parser se rompe,
  // la simulación se rompe con él (que es para lo que sirve).
  assert.ok(
    /from '\.\/respuesta\.ts'/.test(src) && /leerCotizacion\(/.test(src),
    'la respuesta simulada tiene que pasar por leerCotizacion() de respuesta.ts',
  )
})

test('nadie escribe en el libro de consumo fuera del embudo y su persistencia', () => {
  // Si una simulación pudiera anotarse en `codeoscopic_consumo`, contaminaría el
  // gasto y cualquier estadística que se construya después sobre esa tabla.
  const permitidos = new Set([
    'apps/asegura/lib/codeoscopic/consumo.ts',
    'apps/asegura/lib/codeoscopic/cotizar.ts',
  ])
  const infractores = ficheros(/^apps\/asegura\/(app|lib)\/.*\.(ts|tsx)$/)
    .filter((f) => !permitidos.has(f) && !f.endsWith('.test.ts'))
    .filter((f) => /codeoscopic_consumo/.test(codigo(f)))
  assert.deepEqual(
    infractores,
    [],
    `Solo consumo.ts escribe el libro y solo cotizar.ts lo usa:\n  - ${infractores.join('\n  - ')}`,
  )
})

// ─── El cepo se prueba a sí mismo ────────────────────────────────────────────

test('el quitacomentarios no confunde documentación con código', () => {
  // Se apoya en un fichero real: si algún día se recorta de más, salta aquí.
  const c = codigo(SIMULACION_TS)
  assert.ok(!c.includes('Generador de cotizaciones SIMULADAS'), 'la cabecera es un comentario')
  assert.ok(c.includes('export function primaSimulada'), 'el código tiene que sobrevivir')
})

test('el detector de orden distingue un embudo sano de uno roto', () => {
  const sano = 'if (simulacionActiva(env)) { return }\nconst c = await consumoActual(x)\nreservar(y)'
  const roto = 'const c = await consumoActual(x)\nif (simulacionActiva(env)) { return }\nreservar(y)'
  assert.ok(apareceAntesQue(sano, 'simulacionActiva(env)', ['consumoActual(', 'reservar(']))
  assert.ok(!apareceAntesQue(roto, 'simulacionActiva(env)', ['consumoActual(', 'reservar(']))
  assert.ok(!apareceAntesQue('nada de nada', 'simulacionActiva(env)', ['consumoActual(']))
})
