// Fichas de producto del tarificador — la parte con PDF + IA (07/10/2026). Sin BD.
//
// PDF del proyecto → texto con marcas de página (`textoPdfParse`, el mismo de pólizas/ofertas) → IA por la
// pasarela (`iaTexto`, `privado`, categoría `redaccion` como la lectura de ofertas) → JSON → VALIDACIÓN
// DETERMINISTA del paquete (`validarExtraccion`/`validarValoresPresupuesto`): cita en el PDF, importe en su
// cita; lo que no se prueba queda `null` + aviso. La IA nunca decide un valor que el código no pueda ver
// escrito en el documento.
//
// Un PDF sin capa de texto (escaneo) NO se lee: se devuelve `sin_texto` y quien llama lo guarda con
// `texto_legible = false` (no hay visión para proyectos en esta versión).

import { cleanJSON } from '@central/core-ai'
import {
  garantiasFicha,
  validarExtraccion,
  validarValoresPresupuesto,
  type ResultadoValidacion,
  type AvisoExtraccion,
  type ValoresPresupuesto,
} from '@central/module-tarificacion'
import { iaTexto } from './ia'
import { textoPdfParse } from './documentos/extraer-poliza'

export const CATEGORIA_IA_FICHAS = 'redaccion'
const MAX_TEXTO = 60_000
const MAX_TOKENS = 6_000

export type TextoProyecto = { ok: true; texto: string } | { ok: false; motivo: 'sin_texto' }

/** Texto del PDF con marcas «[[Página N]]». Un PDF sin texto (escaneo, cifrado ilegible) → `sin_texto`. */
export async function textoDeProyecto(pdf: Buffer): Promise<TextoProyecto> {
  const texto = await textoPdfParse(pdf, { marcarPaginas: true })
  return texto.replace(/\[\[Página \d+\]\]/g, '').trim() ? { ok: true, texto } : { ok: false, motivo: 'sin_texto' }
}

const FORMA_LIMITE = `{"tipo":"importe","eur":number} | {"tipo":"porcentaje","pct":number,"sobre":string|null} | {"tipo":"primer_riesgo","eur":number} | null`
const FORMA_FRANQUICIA = `{"tipo":"importe","eur":number} | {"tipo":"porcentaje","pct":number,"minimoEur":number|null,"maximoEur":number|null} | {"tipo":"sin_franquicia"} | null`
const FORMA_PRESUPUESTO = `{"primaTotal":{"valor":number,"cita":string}|null,"primaNeta":{"valor":number,"cita":string}|null,
"capitales":[{"clave":string,"valor":number,"cita":string}],
"franquiciaGeneral":{"franquicia":${FORMA_FRANQUICIA},"cita":string}|null}`

function catalogoParaPrompt(ramo: string): string {
  return garantiasFicha(ramo).map((g) => `- ${g.clave}: ${g.etiqueta}`).join('\n')
}

const REGLAS_COMUNES = `Reglas, por orden de importancia:
- La "cita" es la frase o fila del documento COPIADA LITERALMENTE (máx. 300 caracteres), y TIENE que contener el
  número que pones (si pones 3000, la cita dice «3.000 €»). Un código comprobará cada cita contra el PDF: lo que no
  esté escrito tal cual se descarta. Si no puedes citarlo, no lo pongas.
- Si un dato NO aparece, null. NUNCA lo inventes, lo deduzcas, lo calcules ni lo copies de otro campo. NUNCA 0 para
  decir «no aparece». Nada de "N/A" ni "no consta": eso es null.
- Importes en euros, solo el número (1234.56). Un porcentaje no es un importe.`

/** Instrucción para la extracción COMPLETA: condiciones del producto + valores del presupuesto. */
export function instruccionFicha(ramo: string, compania: string): string {
  return `Eres un técnico de seguros español con 20 años de experiencia leyendo proyectos y condicionados de ${compania}
para el ramo «${ramo}». El texto es el PROYECTO / PRESUPUESTO que da el portal de la compañía, con marcas
«[[Página N]]» al principio de cada página.

Hay que separar DOS cosas:
1. Las CONDICIONES DEL PRODUCTO (lo que dice el condicionado para cualquier cliente): por cada garantía, si va
   incluida, opcional o excluida, su límite, sublímites, franquicia y notas.
2. Los VALORES DE ESTE PRESUPUESTO: capitales asegurados (continente/edificación, contenido…), la franquicia
   general elegida y la prima.

Catálogo de garantías (usa ESTAS claves; si una garantía del documento no encaja en ninguna, clave "extra"):
${catalogoParaPrompt(ramo)}

Devuelve SOLO un objeto JSON, sin texto alrededor:
{"producto":string|null,
"version":{"valor":string,"cita":string}|null,
"garantias":[{"clave":string,"literal":string,"estado":"incluida"|"opcional"|"excluida"|null,
  "limite":${FORMA_LIMITE},
  "sublimites":[{"concepto":string,"limite":${FORMA_LIMITE},"cita":string}],
  "franquicia":${FORMA_FRANQUICIA},
  "notas":string|null,"cita":string}],
"presupuesto":${FORMA_PRESUPUESTO}}

${REGLAS_COMUNES}
- "literal": cómo la llama la compañía, tal cual. "notas": SOLO texto literal del documento (condiciones,
  carencias, exclusiones de esa garantía); si no hay, null.
- "estado": "incluida" si el documento la da por contratada, "opcional" si se ofrece como opción no marcada,
  "excluida" si dice expresamente que no está cubierta. Si no lo dice, null (NUNCA «excluida» por no verla).
- "limite": "primer_riesgo" solo si el documento dice «a primer riesgo». "sobre" del porcentaje: sobre qué
  (p. ej. «capital de continente»).
- "version": la edición/modelo del condicionado si aparece (p. ej. «Mod. CG-123 01/2020»), con su cita; si no, null.
- "presupuesto.capitales[].clave": clave del catálogo (continente, contenido…).
- "primaTotal" es lo que paga el cliente en UN AÑO con impuestos y recargos; "primaNeta", antes de impuestos.`
}

/** Instrucción cuando la ficha del producto YA está validada: solo los valores del presupuesto. */
export function instruccionPresupuesto(ramo: string, compania: string): string {
  return `Eres un técnico de seguros español. El texto es un PROYECTO / PRESUPUESTO de ${compania} para el ramo «${ramo}»,
con marcas «[[Página N]]». Las condiciones del producto ya están revisadas: SOLO interesan los valores de ESTE
presupuesto (capitales asegurados, franquicia general elegida y prima).

Claves de capital: ${garantiasFicha(ramo).filter((g) => g.tipoValor === 'capital').map((g) => g.clave).join(', ')}.

Devuelve SOLO un objeto JSON, sin texto alrededor, con esta forma:
${FORMA_PRESUPUESTO}

${REGLAS_COMUNES}`
}

type Ia = typeof iaTexto

async function pedirJson(ia: Ia, system: string, texto: string): Promise<{ ok: true; bruto: unknown } | { ok: false; motivo: string }> {
  let salida: string
  try {
    salida = await ia(texto.slice(0, MAX_TEXTO), { system, maxTokens: MAX_TOKENS, timeoutMs: 90_000, privado: true, categoria: CATEGORIA_IA_FICHAS })
  } catch (e) {
    return { ok: false, motivo: `No se ha podido leer el proyecto con IA: ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    return { ok: true, bruto: JSON.parse(cleanJSON(salida)) }
  } catch {
    return { ok: false, motivo: 'La IA no devolvió un JSON legible.' }
  }
}

export type ExtraccionCompleta = { ok: true; resultado: ResultadoValidacion } | { ok: false; motivo: string }
export type ExtraccionPresupuesto = { ok: true; presupuesto: ValoresPresupuesto; avisos: AvisoExtraccion[] } | { ok: false; motivo: string }

/** Condiciones + presupuesto, validados contra el texto. `ia` inyectable para tests. */
export async function extraerFichaCompleta(texto: string, ctx: { ramo: string; compania: string }, ia: Ia = iaTexto): Promise<ExtraccionCompleta> {
  const r = await pedirJson(ia, instruccionFicha(ctx.ramo, ctx.compania), texto)
  return r.ok ? { ok: true, resultado: validarExtraccion(r.bruto, ctx.ramo, texto) } : r
}

/** Solo los valores del presupuesto (ficha ya validada), validados contra el texto. */
export async function extraerSoloPresupuesto(texto: string, ctx: { ramo: string; compania: string }, ia: Ia = iaTexto): Promise<ExtraccionPresupuesto> {
  const r = await pedirJson(ia, instruccionPresupuesto(ctx.ramo, ctx.compania), texto)
  if (!r.ok) return r
  const v = validarValoresPresupuesto(r.bruto, ctx.ramo, texto)
  return { ok: true, presupuesto: v.presupuesto, avisos: v.avisos }
}
