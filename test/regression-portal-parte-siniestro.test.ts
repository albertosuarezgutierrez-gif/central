// Cepo del PARTE DE SINIESTRO del portal (03/09/2026).
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 LA REGLA: un parte enviado NO es un siniestro comunicado a la compañía.
//
// Una correduría es mediadora del CLIENTE, no del asegurador: contárnoslo a
// nosotros no es, jurídicamente, comunicárselo a la entidad. Entre que el
// cliente pulsa «enviar» y que Alberto abre el siniestro hay un hueco de horas
// o de días, y en ese hueco el cliente cree que ya está hecho y deja de hacer
// nada. Es el peor modo de fallo del portal entero: no se ve, no da error, y
// el que lo paga es quien confió en la pantalla.
//
// Este fichero existe porque esa regla se rompe con un cambio de UNA línea
// («si el estado ya no es `enviado`, es que está comunicado») que además parece
// razonable al leerla. Por eso el guardián no comprueba el resultado: comprueba
// que nadie haya escrito esa línea.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const MODULO = 'packages/module-seguros-portal/src/parte-siniestro.ts'
const APP = 'apps/asegura-portal'

const leerCrudo = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * El fichero SIN comentarios.
 *
 * 🚨 Sin esto el cepo se muerde a sí mismo: el comentario que explica «no digas
 * que su compañía ya lo sabe» CONTIENE esa frase, así que un fichero bien
 * documentado salía marcado y uno mudo pasaba. Un guardián que castiga
 * justamente el comentario que enseña la regla se acaba desactivando, que es
 * peor que no tenerlo. Lo que se vigila es el código y lo que se le pinta al
 * cliente, no la prosa que lo justifica.
 *
 * Escanea en vez de usar un regex porque `'https://…'` dentro de una cadena
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
  const args = ['ls-files', '--cached', '--others', '--exclude-standard', APP]
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
}

test('el módulo puro del parte existe', () => {
  // Un guardián que se salta a sí mismo cuando el fichero no está no es un
  // guardián: es el mismo «no lo he mirado» disfrazado de verde que persigue.
  assert.ok(existsSync(join(ROOT, MODULO)), `falta ${MODULO}`)
})

test('solo `abierto_en_compania` autoriza a decir que la compañía lo sabe', () => {
  const src = leer(MODULO)
  assert.match(
    src,
    /export function comunicadoACompania\(estado: ParteEstado\): boolean \{\s*return estado === 'abierto_en_compania'\s*\}/,
    'comunicadoACompania() es la ÚNICA fuente de esa frase. Si su cuerpo deja de ser ' +
      "una comparación exacta contra 'abierto_en_compania', el portal puede acabar " +
      'diciéndole a alguien que su compañía sabe lo del accidente cuando no lo sabe.',
  )
})

test('nadie deduce «comunicado» de que el estado ya no sea `enviado`', () => {
  // El atajo que rompe la regla, en sus dos formas. `recibido` significa «lo
  // hemos leído NOSOTROS», que es exactamente el estado que se confunde con
  // estar comunicado a la entidad.
  // Exige el PUNTO: `p.estado !== 'enviado'` es la derivación peligrosa; un
  // `estado` local de formulario que vale 'enviado' cuando el POST ha ido bien
  // no tiene nada que ver, y marcarlo enseñaría a saltarse este cepo.
  const atajo = /\.estado\s*(!==|===)\s*['"]enviado['"]/
  const culpables = ficherosDelPortal().filter((f) => atajo.test(leer(f)))
  assert.deepEqual(
    culpables,
    [],
    'Un `estado !== "enviado"` para decidir si la compañía lo sabe es la línea que ' +
      'convierte «lo hemos recibido» en «está comunicado». Usa comunicadoACompania() ' +
      `de @central/module-seguros-portal. Ficheros: ${culpables.join(', ')}`,
  )
})

test('la pantalla no le promete al cliente que su compañía ya lo sabe', () => {
  // Frases medidas, no una heurística: son las que se escriben solas al redactar
  // el mensaje de «enviado con éxito».
  // 🚨 El lookbehind NO es un detalle: la frase CORRECTA de esta pantalla es
  // «todavía NO está comunicado a tu compañía», que contiene literalmente la
  // frase prohibida. Un cepo que castigue la negación obliga a escribir el
  // texto honesto de forma retorcida, o a desactivarlo — y entonces deja de
  // proteger la afirmativa, que es la peligrosa.
  const NEG = '(?<!\\b(?:no|aún|aun|todavía|todavia|sin)\\b[^.]{0,25})'
  const PROHIBIDAS = [
    new RegExp(`${NEG}comunicado a (tu|su) (compañ|asegurador)`, 'i'),
    new RegExp(`${NEG}(hemos|ya hemos) (comunicado|dado parte) a (tu|su) (compañ|asegurador)`, 'i'),
    new RegExp(`${NEG}(tu|su) (compañía|aseguradora) ya (lo sabe|está informad)`, 'i'),
    new RegExp(`${NEG}siniestro abierto en (tu|su) compañ`, 'i'),
  ]
  const culpables: string[] = []
  for (const f of ficherosDelPortal()) {
    const src = leer(f)
    for (const p of PROHIBIDAS) if (p.test(src)) culpables.push(`${f} → ${p}`)
  }
  assert.deepEqual(
    culpables,
    [],
    'El portal no puede afirmar que la entidad conoce el siniestro: eso solo es cierto ' +
      'cuando Alberto lo ha abierto, y hasta entonces el cliente dejaría de hacer nada ' +
      `creyendo que está resuelto. Di el hecho: lo hemos recibido nosotros.\n  - ${culpables.join('\n  - ')}`,
  )
})

test('el portal no le dice a quien avisa tarde que ha perdido la cobertura', () => {
  // Pasarse de los 7 días del art. 16 LCS NO extingue el derecho: la compañía
  // solo puede reclamar los daños que le cause el retraso, y la pérdida exige
  // dolo o culpa grave. Un portal que asuste a quien avisa tarde consigue que
  // no avise nunca — y avisar tarde sigue siendo muchísimo mejor que no avisar.
  const PROHIBIDAS = [
    /(ya no|no) (te|le) (cubre|cubren|cubrirá)/i,
    /(has|ha) perdido (la |el )?(cobertura|derecho)/i,
    /fuera de plazo.{0,40}(sin cobertura|no cubierto)/i,
  ]
  const culpables: string[] = []
  for (const f of ficherosDelPortal()) {
    const src = leer(f)
    for (const p of PROHIBIDAS) if (p.test(src)) culpables.push(`${f} → ${p}`)
  }
  assert.deepEqual(culpables, [], `Ver art. 16 LCS.\n  - ${culpables.join('\n  - ')}`)
})

test('los tri-estados del parte no se colapsan a false', () => {
  // `null` = «no lo ha contestado»; `false` = «ha dicho que no». Colapsarlos
  // deja al corredor leyendo «sin heridos» de un accidente sobre el que nadie
  // preguntó, y un parte con heridos se tramita en horas.
  const colapso = /(hayHeridos|hayTerceros)\s*(\?\?|\|\|)\s*false/
  const culpables = ficherosDelPortal().filter((f) => colapso.test(leer(f)))
  assert.deepEqual(
    culpables,
    [],
    '`hayHeridos`/`hayTerceros` son TRI-ESTADO. Un `?? false` convierte «no me lo han ' +
      `dicho» en «no hay», que es una afirmación que nadie hizo. Ficheros: ${culpables.join(', ')}`,
  )
})

test('la pantalla usa de verdad la única fuente válida del estado', () => {
  // Los cepos de arriba son NEGATIVOS: dicen qué no escribir. Un fichero que
  // sencillamente no pinte el estado los pasa todos y deja al cliente sin saber
  // si su compañía se ha enterado, que es la pregunta que vino a hacer.
  const usan = ficherosDelPortal().filter((f) => /\bcomunicad(o|oACompania)\b/.test(leer(f)))
  assert.notDeepEqual(
    usan,
    [],
    'Ningún fichero del portal usa `comunicado` ni `comunicadoACompania()`. O la ' +
      'pantalla del parte no dice en qué punto está, o lo deduce por otro camino.',
  )
})
