// ────────────────────────────────────────────────────────────────────────────
// Constructores de prompt — PUROS (sin LLM, sin red). Testeables aislados.
//
// El agente pide al modelo que devuelva EXCLUSIVAMENTE un JSON con la forma de
// `FichaConcurso`. La validación/normalización del JSON la hace `parsing.ts`.
// ────────────────────────────────────────────────────────────────────────────

/** Tope de caracteres del pliego que mandamos al modelo (evita desbordar contexto). */
export const MAX_PLIEGO_CHARS = 60_000

const SYSTEM = `Eres un experto en contratación pública española (LCSP, Ley 9/2017) que prepara la documentación para que una empresa se presente a un concurso público.
Tu tarea: leer el pliego (PCAP/PPT/anuncio) y extraer sus datos clave en JSON ESTRICTO.

Reglas:
- Responde SOLO con un objeto JSON válido. Sin texto antes ni después, sin markdown, sin comentarios.
- Importes en euros como número (sin símbolo, sin separador de miles, punto decimal). Si el importe lleva IVA, conviértelo a base sin IVA cuando sea evidente; si no, déjalo tal cual y anótalo en "avisos".
- Fechas en formato 'YYYY-MM-DD'. Si no aparece una fecha, omite el campo.
- No inventes datos: si algo no consta en el pliego, omite el campo (u "avisos" para señalarlo). Es preferible omitir a alucinar.
- "tipo_contrato": uno de servicios|suministros|obras|concesion_servicios|concesion_obras|mixto|otro.
- "procedimiento": uno de abierto|abierto_simplificado|simplificado_sumario|restringido|negociado|dialogo_competitivo|otro.
- "criterios": cada criterio de adjudicación con "puntos" (peso máximo), "tipo" ('automatico' si se aplica una fórmula objetiva como el precio, 'juicio_valor' si es subjetivo/memoria), "sobre" ('tecnico'|'economico') y "formula" (texto) si es automático.
- "documentos": documentación a aportar, cada una con su "sobre" ('administrativo'|'tecnico'|'economico'), "obligatorio" (bool) y "modelo" (anexo del pliego si lo cita).
- "garantias": porcentajes (provisional sobre presupuesto, definitiva sobre adjudicación; típica definitiva = 5).
- "lotes": número de lotes (0 o 1 = sin división en lotes).`

/** Forma del JSON que pedimos (se incrusta en el user prompt como guía). */
const ESQUEMA = `{
  "objeto": string,
  "organo_contratacion"?: string,
  "expediente"?: string,
  "cpv"?: string[],
  "tipo_contrato": "servicios|suministros|obras|concesion_servicios|concesion_obras|mixto|otro",
  "procedimiento": "abierto|abierto_simplificado|simplificado_sumario|restringido|negociado|dialogo_competitivo|otro",
  "presupuesto_base"?: number,
  "valor_estimado"?: number,
  "lotes": number,
  "plazos": { "publicacion"?: "YYYY-MM-DD", "fin_presentacion"?: "YYYY-MM-DD", "fin_aclaraciones"?: "YYYY-MM-DD", "ejecucion_meses"?: number },
  "solvencia": [ { "ambito": "economica|tecnica", "descripcion": string, "importe_minimo"?: number } ],
  "garantias": { "provisional_pct"?: number, "definitiva_pct"?: number, "complementaria_pct"?: number },
  "criterios": [ { "nombre": string, "puntos": number, "tipo": "automatico|juicio_valor", "sobre"?: "tecnico|economico", "formula"?: string } ],
  "documentos": [ { "nombre": string, "sobre": "administrativo|tecnico|economico", "obligatorio": boolean, "modelo"?: string } ],
  "avisos"?: string[]
}`

/**
 * Construye el par {system, user} para extraer la ficha de un pliego.
 * Recorta el texto a `MAX_PLIEGO_CHARS` (los datos clave suelen estar al inicio).
 */
export function construirPromptPliego(textoPliego: string): { system: string; user: string } {
  const texto = (textoPliego || '').slice(0, MAX_PLIEGO_CHARS)
  const user = `Extrae la ficha de este pliego en el JSON con esta forma exacta:

${ESQUEMA}

=== PLIEGO ===
${texto}
=== FIN PLIEGO ===

Devuelve SOLO el JSON.`
  return { system: SYSTEM, user }
}
