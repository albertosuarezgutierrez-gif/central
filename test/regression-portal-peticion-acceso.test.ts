// Cepo de la PETICIÓN DE ACCESO del portal (04/09/2026).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 LA REGLA: la pantalla de «papá, ¿me dejas ver tu seguro?» NO PUEDE
// CONTESTAR SI EL DESTINATARIO EXISTE.
//
// Para pedir acceso hay que decir a quién. Si la respuesta distingue «esa
// persona no está con nosotros» de «petición enviada», el portal se convierte
// en un ORÁCULO: una máquina de comprobar quién es cliente de la correduría, a
// razón de un correo por intento, desde fuera, sin límite y sin dejar un rastro
// que lo parezca. Con 32.600 fichas eso es la cartera entera de Alberto
// expuesta a un bucle.
//
// `respuestaPublica()` existe SOLO para eso: colapsa los cuatro resultados que
// dependen del destinatario —`creada`, `sin_destinatario`, `ya_pendiente`,
// `ya_autorizado`— en una sola frase. Y el modo de fallo es el de siempre en
// este repo: el arreglo que lo rompe parece una MEJORA. «Si no existe, dilo,
// que si no el usuario se queda esperando» es una frase razonable escrita por
// alguien que no ha leído la cabecera del módulo.
//
// Por eso este guardián no mide comportamiento —de eso va
// `packages/module-seguros-portal/src/peticion-acceso.test.ts`— sino el FUENTE:
// que nadie escriba esa rama, que nadie duplique el texto a mano en la pantalla
// (dos copias con matices distintos reabren el oráculo por la puerta del copy)
// y que no desaparezcan los comentarios que explican POR QUÉ el colapso no es
// una simplificación pendiente.
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  RESULTADOS_PETICION,
  RESPUESTAS_PUBLICAS,
  respuestaPublica,
  TEXTO_REGISTRADA,
} from '../packages/module-seguros-portal/src/peticion-acceso.ts'

const ROOT = join(import.meta.dirname, '..')
const MODULO = 'packages/module-seguros-portal/src/peticion-acceso.ts'
const APP = 'apps/asegura-portal'

const leerCrudo = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * El fichero SIN comentarios.
 *
 * 🚨 Sin esto el cepo se muerde a sí mismo, y de la forma más tonta: la cabecera
 * del módulo NOMBRA los estados que aquí se prohíben (`sin_destinatario`,
 * `ya_autorizado`) para explicar por qué se colapsan. Un guardián que castigue
 * el comentario que enseña la regla premia al fichero mudo y castiga al bien
 * documentado — le pasó a `regression-portal-parte-siniestro.test.ts`.
 *
 * Escanea en vez de usar un regex porque una comilla dentro de una cadena
 * truncaría media línea de código y crearía el falso NEGATIVO de al lado.
 */
function sinComentarios(src: string): string {
  let out = ''
  let i = 0
  let comilla: string | null = null
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (comilla) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue }
      if (c === comilla) comilla = null
      out += c; i += 1; continue
    }
    if (c === "'" || c === '"' || c === '`') { comilla = c; out += c; i += 1; continue }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue }
    if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue }
    out += c; i += 1
  }
  return out
}

const leer = (rel: string) => sinComentarios(leerCrudo(rel))

/** Ficheros del portal, incluidos los SIN commitear: el nuevo es justo el que hay que cazar. */
function ficherosDelPortal(): string[] {
  const cached = execFileSync('git', ['ls-files', '--cached', APP], { cwd: ROOT, encoding: 'utf8' })
  const nuevos = execFileSync('git', ['ls-files', '--others', '--exclude-standard', APP], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return [...new Set(`${cached}\n${nuevos}`.split('\n'))]
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
}

/** El cuerpo `{…}` de una función del módulo, contando llaves. */
function cuerpoDe(src: string, firma: RegExp): string {
  const m = firma.exec(src)
  assert.ok(m, `no se encuentra la función: ${firma}`)
  let i = src.indexOf('{', m.index)
  assert.ok(i > 0, `la función no tiene cuerpo: ${firma}`)
  let nivel = 0
  const desde = i
  for (; i < src.length; i++) {
    if (src[i] === '{') nivel += 1
    else if (src[i] === '}') {
      nivel -= 1
      if (nivel === 0) return src.slice(desde, i + 1)
    }
  }
  assert.fail(`cuerpo sin cerrar: ${firma}`)
}

test('el módulo puro de la petición existe', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  assert.ok(existsSync(join(ROOT, MODULO)), `falta ${MODULO}`)
})

// ─── 1. respuestaPublica() sigue existiendo y sigue colapsando ───────────────

test('el módulo sigue exportando respuestaPublica()', () => {
  assert.match(
    leer(MODULO),
    /export function respuestaPublica\(/,
    'sin respuestaPublica() cada llamante decide por su cuenta qué contestar, que es exactamente el oráculo',
  )
})

test('el cuerpo de respuestaPublica() no devuelve NADA fuera de las tres respuestas públicas', () => {
  // El cepo de verdad de este fichero. Basta con una línea —un
  // `if (r === 'sin_destinatario') return 'sin_destinatario'`— para que
  // cualquiera recorra una lista de correos y saque quién es cliente. Y esa
  // línea se escribe sola cuando alguien quiere «mejorar el mensaje de error».
  const cuerpo = cuerpoDe(leer(MODULO), /export function respuestaPublica\(/)
  const devueltos = [...cuerpo.matchAll(/return\s+(['"`])([^'"`]*)\1/g)].map((m) => m[2])
  assert.notDeepEqual(devueltos, [], 'respuestaPublica() ya no devuelve literales: revisa el colapso a mano')

  const permitidas = new Set<string>(RESPUESTAS_PUBLICAS)
  const fugas = devueltos.filter((v) => !permitidas.has(v))
  assert.deepEqual(
    fugas,
    [],
    `respuestaPublica() devuelve ${fugas.map((f) => `'${f}'`).join(', ')}, que no es una respuesta ` +
      'pública. Los resultados que dependen del destinatario (sin_destinatario, ya_pendiente, ' +
      'ya_autorizado) SALEN POR LA MISMA PUERTA que `creada`, o el portal dice quién es cliente.',
  )
  // Y el colapso tiene que estar: alguna rama acaba en `registrada`.
  assert.ok(
    devueltos.includes('registrada'),
    'ninguna rama devuelve `registrada`: el colapso ha desaparecido',
  )
})

test('en ejecución, los cuatro resultados del destinatario dan la MISMA respuesta', () => {
  // El cepo anterior es sobre el texto; este es sobre el resultado, por si el
  // colapso se rompe por un camino que no es un `return` literal (un mapa, un
  // `switch` con variables, un objeto de traducción…).
  const puertas = new Set(
    (['creada', 'sin_destinatario', 'ya_pendiente', 'ya_autorizado'] as const).map(respuestaPublica),
  )
  assert.deepEqual(
    [...puertas],
    ['registrada'],
    `los resultados que dependen del destinatario salen por ${puertas.size} puertas distintas`,
  )
  // Ningún resultado, ni los que se añadan mañana, se escapa del conjunto público.
  for (const r of RESULTADOS_PETICION) {
    assert.ok(
      (RESPUESTAS_PUBLICAS as readonly string[]).includes(respuestaPublica(r)),
      `respuestaPublica('${r}') se sale de RESPUESTAS_PUBLICAS`,
    )
  }
})

test('los estados internos no llegan a la PANTALLA', () => {
  // El otro camino al oráculo: que la respuesta que viaja al navegador lleve el
  // resultado CRUDO (`sin_destinatario`) en vez de la pública, y que la pantalla
  // lo traduzca a un mensaje propio.
  //
  // 🚨 Solo se vigilan los `.tsx`, A PROPÓSITO. El servidor TIENE que nombrar
  // esos estados —es él quien decide cuál ocurrió antes de colapsarlos—, así que
  // prohibirlos en `lib/` y en las rutas obligaría a escribir la lógica honesta
  // de forma retorcida, y un cepo así se acaba desactivando. Lo que ninguna
  // pantalla necesita saber es cuál de los cuatro fue.
  const internos = RESULTADOS_PETICION.filter(
    (r) => !(RESPUESTAS_PUBLICAS as readonly string[]).includes(r),
  )
  const culpables: string[] = []
  for (const f of ficherosDelPortal().filter((f) => f.endsWith('.tsx'))) {
    const src = leer(f)
    for (const r of internos) {
      if (new RegExp(`['"\`]${r}['"\`]`).test(src)) culpables.push(`${f} → '${r}'`)
    }
  }
  assert.deepEqual(
    culpables,
    [],
    'una pantalla del portal nombra un resultado interno: o la API se lo ha mandado, o lo ' +
      'deduce por su cuenta, y en los dos casos puede acabar diciendo si el destinatario existe. ' +
      `La pantalla solo ve lo que devuelve respuestaPublica().\n  - ${culpables.join('\n  - ')}`,
  )
})

// ─── 2. El texto de `registrada` se importa, no se copia ────────────────────

test('nadie reescribe a mano el texto de TEXTO_REGISTRADA', () => {
  // Dos copias del mismo mensaje con matices distintos —«te avisaremos cuando
  // acepte» aquí y «no hemos encontrado a esa persona» allá— reabren el oráculo
  // por la puerta del copy, sin tocar una sola línea de lógica.
  //
  // Las ventanas se DERIVAN de la constante, así que el cepo no se queda
  // desincronizado el día que se retoque la frase.
  const palabras = TEXTO_REGISTRADA.replace(/\s+/g, ' ').trim().split(' ')
  const ventanas: string[] = []
  for (let i = 0; i + 5 <= palabras.length; i++) ventanas.push(palabras.slice(i, i + 5).join(' '))
  assert.ok(ventanas.length > 5, 'el texto se ha quedado tan corto que el cepo ya no discrimina')

  const culpables: string[] = []
  for (const f of ficherosDelPortal()) {
    const src = leer(f).replace(/\s+/g, ' ')
    const pillada = ventanas.find((v) => src.includes(v))
    if (pillada) culpables.push(`${f} → «${pillada}…»`)
  }
  assert.deepEqual(
    culpables,
    [],
    'el texto de la respuesta `registrada` está escrito a mano en el portal. Impórtalo: ' +
      `TEXTO_REGISTRADA de @central/module-seguros-portal.\n  - ${culpables.join('\n  - ')}`,
  )
})

// ─── 3. El comentario es la mitad del cepo ──────────────────────────────────

test('la cabecera del módulo sigue explicando el ORÁCULO', () => {
  // Sin el comentario, el siguiente que lea `respuestaPublica()` verá cuatro
  // casos devolviendo lo mismo y creerá que es una simplificación pendiente.
  // Un cepo que solo prohíbe, sin decir por qué, se acaba borrando junto con lo
  // que protege.
  const crudo = leerCrudo(MODULO)
  const cabecera = crudo.slice(0, crudo.search(/^export /m))
  assert.match(
    cabecera,
    /or[áa]culo/i,
    'la cabecera de peticion-acceso.ts ya no explica el oráculo: sin ese porqué, el colapso de ' +
      'respuestaPublica() parece código repetido y alguien lo «arregla»',
  )
  assert.match(
    cabecera,
    /COLAPSA|colapsa/,
    'la cabecera ya no dice que respuestaPublica() COLAPSA los estados del destinatario',
  )
})

test('respuestaPublica() conserva el comentario que dice para qué está', () => {
  const crudo = leerCrudo(MODULO)
  const i = crudo.search(/export function respuestaPublica\(/)
  assert.ok(i > 0, 'no se encuentra respuestaPublica()')
  // Los 900 caracteres anteriores a la firma: ahí vive su bloque de doc.
  const previo = crudo.slice(Math.max(0, i - 900), i)
  assert.match(
    previo,
    /or[áa]culo/i,
    'el bloque de doc de respuestaPublica() ya no menciona el oráculo que impide',
  )
})

test('el comentario de TEXTO_REGISTRADA sigue diciendo por qué vive en el módulo', () => {
  const crudo = leerCrudo(MODULO)
  const i = crudo.search(/export const TEXTO_REGISTRADA/)
  assert.ok(i > 0, 'no se encuentra TEXTO_REGISTRADA')
  const previo = crudo.slice(Math.max(0, i - 700), i)
  assert.match(
    previo,
    /dos veces|copy|duplic/i,
    'el doc de TEXTO_REGISTRADA ya no advierte de la copia con matices distintos',
  )
})
