// El agente quincenal del blog de la correduría: prompt, validación e inserción.
//
// ─── Qué NO hace, y por qué ────────────────────────────────────────────────
// No publica. Redacta, valida y deja un PR abierto; publicar es un clic de
// Alberto en `/correduria`. La razón no es prudencia genérica: el artículo se
// firma con su nombre y su clave DGSFP en el JSON-LD, y lo lee alguien que está
// a punto de decidir sobre un plazo legal.
//
// ─── La lección que se copia de `apps/ia-rest` ─────────────────────────────
// Aquel agente sigue corriendo su cron y tiene CUATRO borradores parados desde
// junio. No falló la generación: falló que el borrador espera en una pantalla
// que nadie abre. Por eso aquí el aviso va a Telegram y la aprobación vive en
// `/correduria`, que es donde Alberto ya trabaja todos los días.
//
// ─── Y la que NO se copia ──────────────────────────────────────────────────
// ia-rest commitea directo a `main` con `GH_PAT`. Se escribió antes de que
// `main` tuviera ruleset. Aquí se usa el patrón maduro de `lib/sivra/
// seo-landing.ts`: rama propia, PR, y que la CI decida.

import {
  revisarCopy,
  explicarInfracciones,
  citasNoRespaldadas,
  idsDesconocidos,
  normaPorId,
} from '@central/module-seguros'
import type { TemaBlog } from './blog-temas.ts'

/** Lo que el modelo tiene que devolver. Se valida campo a campo antes de nada. */
export type ArticuloGenerado = {
  h1: string
  title: string
  description: string
  resumen: string
  secciones: { titulo: string; parrafos: string[] }[]
  faq: { pregunta: string; respuesta: string }[]
}

/**
 * El prompt.
 *
 * 🚨 Las normas van EN el prompt con su síntesis verificada, y se prohíbe citar
 * cualquier otra. No es una recomendación al modelo: es lo único que hace la
 * salida publicable. Un modelo que escribe sobre la Ley de Contrato de Seguro
 * acierta casi siempre de memoria, y el «casi» es una fecha límite equivocada
 * en la web de un corredor.
 */
export function construirPrompt(tema: TemaBlog, fecha: string): string {
  const normas = tema.normas
    .map((id) => normaPorId(id))
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .map((n) => `- id \`${n.id}\`: ${n.articulo ? `artículo ${n.articulo} de la ` : ''}${n.norma}. ${n.sintesis}`)
    .join('\n')

  return `Eres el corredor de seguros que escribe el blog de su propia correduría. Escribes para alguien que tiene un problema concreto HOY y busca en Google cómo resolverlo.

TEMA
Consulta que hay que cubrir: «${tema.consulta}»
Ángulo: ${tema.angulo}
Fecha de publicación: ${fecha}

${normas ? `NORMAS QUE PUEDES CITAR (y solo estas):\n${normas}` : 'NO CITES NINGUNA NORMA. Este tema se responde sin apoyarse en artículos de ley.'}

REGLAS ABSOLUTAS
1. No cites ninguna ley, artículo, orden ni real decreto que no esté en la lista de arriba. Ni "el artículo 38", ni "la Ley 20/2015", ni "la normativa de la DGSFP". Si para responder bien hace falta una norma que no está, escribe el artículo sin ella.
2. Cuando cites una de las normas permitidas, di lo que dice la síntesis. No añadas plazos, porcentajes ni excepciones que no aparezcan en ella.
3. Prohibido prometer precio o resultado: nada de "ahorra", "el mejor precio", "más barato", "garantizamos", "te ahorramos", "sin letra pequeña", ni porcentajes de ahorro.
4. Prohibido acotar el servicio a un territorio: nada de "en Sevilla", "en Andalucía", "Sevilla y provincia". Se media en toda España.
5. No inventes cifras, estudios, casos de clientes ni testimonios. Nada de datos que no puedas sostener.
6. No hables de las compañías por su nombre ni compares entre ellas.
7. Español de España, tuteando. Frases cortas. Cero relleno de introducción: la primera frase ya responde algo.

FORMA
- 700-950 palabras en total.
- 3 o 4 secciones con su encabezado.
- 2 o 3 preguntas frecuentes al final, con respuesta de 2-4 frases.
- \`title\`: máximo 45 caracteres (se le añade " · Grupo ASegura" después). Sin la marca dentro.
- \`description\`: entre 115 y 160 caracteres.
- \`resumen\`: una o dos frases que respondan la consulta de golpe.

Responde SOLO con un JSON válido, sin markdown ni comentarios, con esta forma exacta:
{"h1":"...","title":"...","description":"...","resumen":"...","secciones":[{"titulo":"...","parrafos":["...","..."]}],"faq":[{"pregunta":"...","respuesta":"..."}]}`
}

/** Un motivo por el que el artículo no se publica, en lenguaje de persona. */
export type Reparo = { campo: string; motivo: string }

/**
 * Revisa lo que ha devuelto el modelo.
 *
 * Devuelve la lista COMPLETA de reparos, no el primero: si hay que reintentar,
 * el segundo intento debería corregirlo todo de una vez.
 *
 * 🚨 Esto no sustituye a los cepos de `apps/asegura-web`: los duplica a
 * propósito. Aquí evitan abrir un PR que va a salir rojo; allí son la red que
 * no depende de que este código sea correcto.
 */
export function revisarGenerado(a: ArticuloGenerado, tema: TemaBlog): Reparo[] {
  const reparos: Reparo[] = []
  const falta = (campo: string, v: unknown) =>
    typeof v !== 'string' || v.trim().length === 0
      ? reparos.push({ campo, motivo: 'vacío o ausente' })
      : null

  falta('h1', a.h1)
  falta('title', a.title)
  falta('description', a.description)
  falta('resumen', a.resumen)

  if (a.title && `${a.title} · Grupo ASegura`.length > 65) {
    reparos.push({ campo: 'title', motivo: `${a.title.length} caracteres: con la marca no cabe en la SERP (máx 65 en total)` })
  }
  if (a.title && /Grupo\s+ASegura/i.test(a.title)) {
    reparos.push({ campo: 'title', motivo: 'repite la marca, que ya añade la plantilla' })
  }
  if (a.description && (a.description.length < 110 || a.description.length > 165)) {
    reparos.push({ campo: 'description', motivo: `${a.description.length} caracteres (debe estar entre 110 y 165)` })
  }
  if (!Array.isArray(a.secciones) || a.secciones.length < 3) {
    reparos.push({ campo: 'secciones', motivo: 'menos de 3 secciones' })
  } else {
    for (const s of a.secciones) {
      if (!s?.titulo?.trim()) reparos.push({ campo: 'secciones', motivo: 'una sección sin título' })
      if (!Array.isArray(s?.parrafos) || s.parrafos.length === 0 || s.parrafos.some((p) => !p?.trim())) {
        reparos.push({ campo: 'secciones', motivo: `la sección «${s?.titulo ?? '?'}» no tiene párrafos con contenido` })
      }
    }
  }
  if (Array.isArray(a.faq)) {
    for (const f of a.faq) {
      if (!f?.pregunta?.trim() || !f?.respuesta?.trim()) {
        reparos.push({ campo: 'faq', motivo: 'una pregunta frecuente incompleta' })
      }
    }
  }

  const texto = textoPlano(a)

  // El mismo cepo que la web y que los borradores de redes. Una sola fuente.
  const infracciones = revisarCopy(texto)
  if (infracciones.length > 0) {
    reparos.push({ campo: 'copy', motivo: explicarInfracciones(infracciones) })
  }

  // 🚨 El reparo que justifica todo lo demás.
  const desconocidos = idsDesconocidos(tema.normas)
  if (desconocidos.length > 0) {
    reparos.push({ campo: 'tema', motivo: `el tema declara normas que no existen: ${desconocidos.join(', ')}` })
  }
  const sinRespaldo = citasNoRespaldadas(texto, tema.normas)
  if (sinRespaldo.length > 0) {
    reparos.push({
      campo: 'citas',
      motivo: `cita normas que nadie ha verificado contra el BOE: ${sinRespaldo.join(', ')}`,
    })
  }

  return reparos
}

/** Todo el texto visible, que es sobre lo que se revisa. */
export function textoPlano(a: ArticuloGenerado): string {
  return [
    a.h1,
    a.title,
    a.description,
    a.resumen,
    ...(a.secciones ?? []).flatMap((s) => [s?.titulo ?? '', ...(s?.parrafos ?? [])]),
    ...(a.faq ?? []).flatMap((f) => [f?.pregunta ?? '', f?.respuesta ?? '']),
  ].join('\n')
}

/** Escapa para meterlo en una cadena TypeScript entre comillas simples. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').trim()
}

/**
 * El bloque TypeScript del artículo, tal y como se inserta en
 * `apps/asegura-web/lib/articulos.ts`.
 *
 * Se genera código, no JSON, porque el blog son datos tipados: así el artículo
 * nuevo pasa por `tsc` y por los nueve cepos del blog antes de que nadie lo
 * mire. Un borrador en una tabla no tiene quien lo revise.
 */
export function bloqueTs(a: ArticuloGenerado, tema: TemaBlog, fecha: string): string {
  const secciones = a.secciones
    .map(
      (s) => `      {
        titulo: '${esc(s.titulo)}',
        parrafos: [
${s.parrafos.map((p) => `          '${esc(p)}',`).join('\n')}
        ],
      },`,
    )
    .join('\n')

  const faq = (a.faq ?? [])
    .map((f) => `      { pregunta: '${esc(f.pregunta)}', respuesta: '${esc(f.respuesta)}' },`)
    .join('\n')

  return `  {
    slug: '${tema.slug}',
    h1: '${esc(a.h1)}',
    title: '${esc(a.title)}',
    description: '${esc(a.description)}',
    fecha: '${fecha}',
    resumen: '${esc(a.resumen)}',
    consulta: '${esc(tema.consulta)}',
${tema.normas.length > 0 ? `    base: [${tema.normas.map((n) => `'${n}'`).join(', ')}],\n` : ''}${tema.ramos.length > 0 ? `    ramos: [${tema.ramos.map((r) => `'${r}'`).join(', ')}],\n` : ''}    secciones: [
${secciones}
    ],${faq ? `\n    faq: [\n${faq}\n    ],` : ''}
  },
`
}

/** Marca por la que se inserta. Vigilada por un cepo en `apps/asegura-web`. */
export const MARCADOR = '  // ⬇️ MARCADOR DE INSERCIÓN — no quitar.'

/**
 * Inserta el bloque en el fuente de `articulos.ts`.
 *
 * 🚨 Lanza si el marcador no está, en vez de añadir al final o de devolver el
 * fuente sin tocar. Un fallo silencioso aquí es «el blog dejó de crecer», y eso
 * se descubre semanas después.
 */
export function insertarEnFuente(fuente: string, bloque: string): string {
  const i = fuente.indexOf(MARCADOR)
  if (i < 0) {
    throw new Error(
      'articulos.ts ya no tiene el marcador de inserción: el agente no puede añadir el artículo sin reescribir el fichero, y eso no lo hace.',
    )
  }
  return fuente.slice(0, i) + bloque + fuente.slice(i)
}

/** Los slugs ya publicados, leídos del fuente. Evita repetir tema. */
export function slugsPublicados(fuente: string): string[] {
  return [...fuente.matchAll(/^\s{4}slug: '([a-z0-9-]+)',$/gm)].map((m) => m[1])
}

/**
 * Extrae el JSON de la respuesta del modelo.
 *
 * Devuelve `null` si no hay JSON utilizable, y eso NO se rellena con un objeto
 * vacío: un artículo a medias que pasa la validación por estar vacío sería
 * peor que ninguno.
 */
export function parsearRespuesta(raw: string): ArticuloGenerado | null {
  const limpio = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const i = limpio.indexOf('{')
  const j = limpio.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    const o = JSON.parse(limpio.slice(i, j + 1)) as ArticuloGenerado
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}
