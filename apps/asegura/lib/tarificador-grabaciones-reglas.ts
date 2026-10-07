// GRABADOR del tarificador RPA — reglas PURAS del lado de asegura (07/10/2026). `node --test`.
//
// Alberto graba a mano, con el bookmarklet «Grabar pantalla ASegura», las pantallas de un presupuesto
// FICTICIO en el portal de una compañía nueva; las sube desde plataforma y aquí se guardan (re-redactadas) y
// se mandan a la IA para sacar un MAPA por pantalla. Lo duro (redacción, recorte, esquema del mapa,
// clasificación de botones) vive en @central/module-tarificacion (grabador.ts); aquí solo el alta, el tope
// de coste y los textos de la IA.
//
// 🚨 TARIFICAR ≠ EMITIR: el mapa es documentación. Ningún botón de él se pulsa desde aquí.

import { BLOQUEO_GRABADOR, MAX_BYTES_PANTALLA, MAX_PANTALLAS, TIPOS_CAMPO_MAPA, redactarHtmlGrabacion, separarGrabacion } from '@central/module-tarificacion'

export const SQL_GRABACIONES = 'apps/asegura/prisma/sql/2026-10-07b_tarificador_grabaciones.sql'
export const MENSAJE_TABLA_SIN_CREAR = `Las grabaciones aún no están activas: falta aplicar ${SQL_GRABACIONES} en la base.`

/** ¿El error es «la tabla/columna no existe» (SQL sin aplicar)? */
export function esTablaSinCrear(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /does not exist|no existe|42P01|42703/i.test(m)
}

// ─── Tope de coste ───────────────────────────────────────────────────────────

export const MAX_LLAMADAS_POR_DEFECTO = 60
/** Llamadas a la IA por grabación (`TARIFICADOR_GRABADOR_MAX_LLAMADAS`, 1..200; si no, 60). */
export function maxLlamadasGrabador(env: Record<string, string | undefined>): number {
  const n = Number((env.TARIFICADOR_GRABADOR_MAX_LLAMADAS ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 200 ? n : MAX_LLAMADAS_POR_DEFECTO
}

/** Pantallas por petición de «Analizar» (cada una es una llamada de hasta ~45 s; el resto, en la siguiente). */
export const LOTE_ANALISIS = 3
/** Caracteres de HTML recortado que se mandan por pantalla. */
export const MAX_CHARS_IA = 60_000

/** Euros estimados: la misma tarifa de referencia que el formador. Orientativo (el real está en `ai_usos`). */
export { costeEstimado as costeEstimadoGrabador } from './tarificador-formador-reglas.ts'

// ─── Alta ────────────────────────────────────────────────────────────────────

export type AltaGrabacion = { compania: string; ramo: string; producto: string | null; nota: string | null }

function cadena(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return false
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? false : t
}

export function leerAltaGrabacion(body: unknown): { ok: true; alta: AltaGrabacion } | { ok: false; mensaje: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, mensaje: 'cuerpo JSON requerido' }
  const b = body as Record<string, unknown>
  const compania = cadena(b.compania, 80)
  const ramo = cadena(b.ramo, 80)
  const producto = cadena(b.producto, 120)
  // La nota admite saltos de línea.
  const nota = typeof b.nota === 'string' ? (b.nota.trim() ? b.nota.trim() : null) : b.nota == null ? null : false
  if (!compania) return { ok: false, mensaje: 'falta la compañía (máx. 80 caracteres)' }
  if (!ramo) return { ok: false, mensaje: 'falta el ramo (máx. 80 caracteres)' }
  if (producto === false) return { ok: false, mensaje: 'producto: máx. 120 caracteres' }
  if (nota === false || (typeof nota === 'string' && nota.length > 2000)) return { ok: false, mensaje: 'nota: máx. 2000 caracteres' }
  return { ok: true, alta: { compania, ramo, producto, nota } }
}

/** Comprueba una subida antes de tocar la BD. `bytes` = tamaño en UTF-8. */
export function comprobarSubida(nombre: string, bytes: number, html: string, yaSubidas: number): string | null {
  if (yaSubidas >= MAX_PANTALLAS) return `la grabación ya tiene ${MAX_PANTALLAS} pantallas (máximo)`
  if (!Number.isFinite(bytes) || bytes <= 0) return 'el fichero está vacío'
  if (bytes > MAX_BYTES_PANTALLA) return `el fichero pasa de ${MAX_BYTES_PANTALLA / 1024 / 1024} MB`
  if (!/<html|<body|<form|<!-- grabador ASegura/i.test(html.slice(0, 200_000))) return 'no parece una página HTML'
  if (!nombre) return 'falta el nombre del fichero'
  return null
}

export type PantallaPlanificada = { nombre: string; html: string; contenido: Buffer }

/**
 * Prepara una subida (una pantalla suelta o el fichero MULTIPANTALLA `grabacion-….html` del modo automático):
 * lo separa en pantallas ORDENADAS, RE-REDACTA cada una por separado (también su aviso de login) y aplica los
 * topes por pantalla (4 MB, que parezca HTML) y los de la grabación (40 pantallas entre las ya subidas y las nuevas).
 * El tope TOTAL de la petición lo pone la ruta (4 MB: límite de cuerpo de Vercel); la UI trocea lo mayor.
 * Una pantalla suelta conserva su nombre; las de un multipantalla se llaman `<nombre sin .html>-p01.html`…
 */
export function planificarSubida(nombre: string, htmlSubido: string, yaSubidas: number): { ok: true; pantallas: PantallaPlanificada[]; multipantalla: boolean } | { ok: false; mensaje: string } {
  const s = separarGrabacion(htmlSubido)
  if (s.pantallas.length === 0) return { ok: false, mensaje: 'el fichero no tiene ninguna pantalla' }
  if (yaSubidas + s.pantallas.length > MAX_PANTALLAS) return { ok: false, mensaje: `la grabación ya tiene ${yaSubidas} pantallas y el fichero trae ${s.pantallas.length} (máximo ${MAX_PANTALLAS})` }
  const base = nombre.replace(/\.html?$/i, '')
  const pantallas: PantallaPlanificada[] = []
  for (const [i, crudo] of s.pantallas.entries()) {
    const html = redactarHtmlGrabacion(crudo)
    const contenido = Buffer.from(html, 'utf8')
    const n = s.multipantalla ? `${base}-p${String(i + 1).padStart(2, '0')}.html` : nombre
    const motivo = comprobarSubida(n, contenido.length, html, yaSubidas + i)
    if (motivo) return { ok: false, mensaje: s.multipantalla ? `pantalla ${i + 1} del fichero: ${motivo}` : motivo }
    pantallas.push({ nombre: n, html, contenido })
  }
  return { ok: true, pantallas, multipantalla: s.multipantalla }
}

// ─── IA ─────────────────────────────────────────────────────────────────────

/** Tope de opciones que se le pide a la IA por select (la salida larga trunca el JSON en pantallas grandes). */
export const MAX_OPCIONES_IA = 25
/** Tokens de salida y espera de la llamada de análisis (la pasarela acota a 55 s; la ruta dura 60). */
export const MAX_TOKENS_ANALISIS = 12_000
export const TIMEOUT_ANALISIS_MS = 55_000

/**
 * ¿La respuesta de la IA parece CORTADA a media salida? Hay un `{` pero las llaves/corchetes no cierran (fuera de
 * cadenas) o termina dentro de una cadena. Un JSON completo (aunque inválido por otra cosa) devuelve false.
 */
export function respuestaIACortada(texto: string): boolean {
  if (typeof texto !== 'string') return false
  const t = texto.replace(/```(?:json)?/gi, '')
  const i = t.indexOf('{')
  if (i < 0) return false
  let prof = 0, enCadena = false, escape = false
  for (let k = i; k < t.length; k++) {
    const c = t[k]
    if (enCadena) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') enCadena = true
    else if (c === '{' || c === '[') prof++
    else if (c === '}' || c === ']') { prof--; if (prof <= 0) return false }
  }
  return true
}

export function sistemaAnalisis(): string {
  return [
    'Eres analista de formularios de portales de compañías de seguros españolas. Recibes el HTML RECORTADO de UNA',
    'pantalla de un presupuesto ficticio (sin valores de campos ni scripts). Los marcos (iframes) van separados con',
    '«### marco «ruta»». Devuelve SOLO un objeto JSON, sin texto alrededor, con EXACTAMENTE estas claves:',
    '{"titulo": string (qué pantalla es, ≤160),',
    ` "campos": [{"etiqueta": string, "selector": string, "tipo": ${TIPOS_CAMPO_MAPA.map((t) => `"${t}"`).join('|')}, "obligatorio": boolean, "opciones": string[]|null, "marco": string|null}],`,
    ' "botones": [{"texto": string, "selector": string, "clase": "seguro"|"prohibido", "funcion": string|null, "marco": string|null}],',
    ' "primas": [{"etiqueta": string, "selector": string|null, "marco": string|null}],',
    ' "notas": string|null}',
    'Reglas:',
    '- selector: el más ESTABLE. Primero #id (si el id no parece autogenerado), luego [name="…"], luego un selector',
    '  corto por etiqueta asociada o atributos. Nada de :nth-child salvo que no haya otra cosa. Una sola línea.',
    '- marco: la ruta del marco donde está el elemento («appArea», «appArea/datos») o null si está en la página principal.',
    '- obligatorio: true si lleva required/aria-required, un asterisco en la etiqueta o lo dice el texto.',
    '- opciones: el TEXTO visible de las opciones de un select (o de un grupo de radios); null si no aplica.',
    `  MÁXIMO ${MAX_OPCIONES_IA} opciones por campo (las primeras si hay más; no las listes todas). Sé COMPACTO: textos cortos,`,
    '  sin explicaciones largas; "funcion" y "notas" en pocas palabras o null.',
    '- botones: todo lo que se pulsa (button, input submit/button, enlaces con aspecto de botón, pestañas).',
    '  "seguro" = navegar, siguiente/anterior, calcular/recalcular, pestañas de datos, ver detalle.',
    `  "prohibido" = cualquier cosa que emita, contrate, formalice, grabe, archive, acepte de forma definitiva, firme,`,
    `  pague, confirme o tramite (palabras de bloqueo: ${BLOQUEO_GRABADOR.join(', ')}). ANTE LA DUDA, "prohibido".`,
    '- primas: dónde aparece la prima/precio (neta, total, por modalidad o fraccionamiento), con su selector si lo hay.',
    '- No inventes elementos que no estén en el HTML. No copies datos personales ni valores.',
  ].join('\n')
}

export function promptAnalisis(c: { compania: string; ramo: string; producto: string | null; pantalla: number; total: number; html: string }): string {
  return [
    `Compañía: ${c.compania}. Ramo: ${c.ramo}.${c.producto ? ` Producto: ${c.producto}.` : ''}`,
    `Pantalla ${c.pantalla} de ${c.total}.`,
    'HTML recortado:',
    c.html,
  ].join('\n')
}
