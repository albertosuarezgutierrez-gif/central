// Lee una OFERTA de compañía (o la póliza actual del cliente) subida a una oportunidad: PDF → texto
// (con marcas de página) → IA experta en seguros → zod → claves canónicas (05/10/2026, F2).
//
// ─── Lo que sale de aquí NO es un precio ni una cobertura «de verdad» ─────────
// Es lo que una máquina dice haber leído, con la CITA (página + texto literal) de dónde lo leyó. El
// corredor lo REVISA antes de que llegue a ningún presupuesto (`oportunidad_oferta.estado`), y el
// trigger de la BD impide que salga lo no revisado. Las comparaciones y cifras del estudio las
// calcula código determinista (`compararOfertas`), nunca la IA.
//
// ─── Qué se reutiliza ─────────────────────────────────────────────────────────
// · El texto: `textoPdfParse` de `extraer-poliza.ts` (con `marcarPaginas`) y, si el PDF está cifrado,
//   `leerPdfProbando` sin contraseña (el de solo propietario se abre así; pierde las páginas).
// · La IA: `iaTexto` (pasarela, `privado`), con la categoría `redaccion` del catálogo del Director
//   (Claude Sonnet hoy; más capaz que el flash por defecto). Sin pasarela cae a la directa de siempre.
// · El rechazo de escaneos es el de `extraer-poliza.ts` (un PDF sin texto no se lee): en esta versión
//   NO hay visión para ofertas, así que el consejo cambia.

import { cleanJSON } from '@central/core-ai'
import type { RamoOferta } from '@central/module-seguros'
import { iaTexto } from '../ia.ts'
import { leerPdfProbando, pdfCifrado } from './pdf-contrasena.ts'
import { textoPdfParse } from './extraer-poliza.ts'
import { normalizarOfertaLeida, type OfertaLeida } from './oferta-leida.ts'

export type ResultadoLecturaOferta =
  | { ok: true; oferta: OfertaLeida; paginas: boolean }
  | { ok: false; motivo: string }

/** Categoría del catálogo de la pasarela para leer ofertas (ver `ia-director-refresh` de plataforma). */
export const CATEGORIA_IA_OFERTAS = 'redaccion'

const MAX_TOKENS = 6000
const MAX_TEXTO = 60_000

const ETIQUETA_RAMO: Record<RamoOferta, string> = {
  comunidades: 'comunidad de propietarios',
  comercio: 'comercio / pyme',
  hogar: 'hogar',
  generico: 'el ramo que sea',
}

export function instruccionOferta(ramo: RamoOferta, rol: 'actual' | 'oferta'): string {
  return `Eres un técnico de seguros español con 20 años de experiencia leyendo ofertas y condiciones particulares de
compañías (Mapfre, AXA, Allianz, Reale, Generali, Santa Lucía, Catalana Occidente, Liberty, Zurich, Helvetia…) para
${ETIQUETA_RAMO[ramo]}. El documento es ${rol === 'actual' ? 'la PÓLIZA QUE EL CLIENTE TIENE HOY' : 'una OFERTA / PRESUPUESTO de una compañía'}.
El texto viene con marcas «[[Página N]]» al principio de cada página.

Devuelve SOLO un objeto JSON, sin texto alrededor, con esta forma:
{"compania":string|null,"producto":string|null,"primaNeta":number|null,"primaTotal":number|null,
"franquiciaGeneral":number|null,"formaPago":string|null,"fechaEfecto":"YYYY-MM-DD"|null,"validezHasta":"YYYY-MM-DD"|null,
"otrasModalidades":[string],
"garantias":[{"nombre":string,"estado":"incluida"|"excluida"|null,"capital":number|null,"limite":number|null,
"franquicia":number|null,"pagina":number|null,"texto":string|null}]}

Reglas, por orden de importancia:
- Si un dato NO aparece en el documento, null. NUNCA lo inventes, lo deduzcas, lo calcules ni lo copies de
  otro campo. NUNCA pongas 0 para decir «no aparece». No escribas "no consta", "N/A" ni similares: eso es null.
- "compania" es la ASEGURADORA que asume el riesgo (membrete o razón social), NO el mediador, corredor,
  agente ni banco. "producto" es el nombre comercial del producto/modalidad tal cual.
- "primaTotal" es lo que paga el cliente en UN AÑO con impuestos y recargos (IPS, Consorcio): el «total recibo
  anual» o «prima total». "primaNeta" es la prima antes de impuestos y recargos. Si solo aparece una de las dos,
  la otra es null. Si el pago es fraccionado, el importe ANUAL. Números en euros, solo el número (1234.56).
- "franquiciaGeneral": la franquicia general de la póliza si el documento la fija para todo; si no, null.
- "garantias": UNA entrada por cada garantía/cobertura que el documento nombre (continente, contenido,
  responsabilidad civil, daños por agua, rotura de cristales, robo, fenómenos atmosféricos, defensa jurídica,
  asistencia, daños eléctricos, avería de maquinaria, pérdida de beneficios…), con:
  · "nombre": el texto LITERAL con el que la compañía la nombra (no lo traduzcas ni lo resumas).
  · "estado": "incluida" si el documento la da por contratada/incluida, "excluida" si dice expresamente que no
    está contratada o está excluida; null si no lo dice.
  · "capital": la suma asegurada (continente, contenido, mobiliario…); "limite": el límite por siniestro o el
    sublímite (RC, daños por agua, cristales…); "franquicia": la franquicia de ESA garantía. Solo números en euros;
    un porcentaje NO es un importe (déjalo en el texto y pon null). "Incluido" o "según condicionado" no es un
    número: null.
  · "pagina": el número N de la marca «[[Página N]]» donde aparece; "texto": la frase o fila del documento de la que
    sale, COPIADA LITERALMENTE (máximo 200 caracteres). Es la prueba: si no la puedes citar, no la pongas.
- "otrasModalidades": si el documento ofrece varias modalidades/opciones, extrae la que figure como elegida o, si no
  hay ninguna marcada, la PRIMERA; y aquí los nombres de las demás. Si solo hay una, [].
- Las fechas siempre YYYY-MM-DD.`
}

/** Texto del PDF con marcas de página. `paginas: false` = se sacó sin marcas (PDF cifrado). */
async function textoDeOferta(buffer: Buffer): Promise<{ ok: true; texto: string; paginas: boolean } | { ok: false; motivo: string }> {
  if (pdfCifrado(buffer)) {
    const marcado = await textoPdfParse(buffer, { marcarPaginas: true })
    if (marcado.replace(/\[\[Página \d+\]\]/g, '').trim()) return { ok: true, texto: marcado, paginas: true }
    const r = await leerPdfProbando(buffer, [])
    if (r.ok && r.texto.trim()) return { ok: true, texto: r.texto, paginas: false }
    return { ok: false, motivo: 'El PDF tiene contraseña y no se ha podido abrir. Pide a la compañía la oferta sin protección, o ábrela y súbela sin contraseña.' }
  }
  const texto = await textoPdfParse(buffer, { marcarPaginas: true })
  return { ok: true, texto, paginas: true }
}

/**
 * Lee la oferta. Nunca lanza: devuelve el motivo con nombre (la ruta guarda el fichero igual y la
 * oferta queda para rellenar a mano). `iaTextoInyectada` solo para tests.
 */
export async function leerOferta(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  ctx: { ramo: RamoOferta; rol: 'actual' | 'oferta' },
  iaTextoInyectada: typeof iaTexto = iaTexto,
): Promise<ResultadoLecturaOferta> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  if (!esPdf) {
    return { ok: false, motivo: 'Las ofertas se leen desde el PDF de la compañía. Sube el PDF (las fotos no se leen en esta versión).' }
  }
  const t = await textoDeOferta(buffer)
  if (!t.ok) return t
  if (!t.texto.replace(/\[\[Página \d+\]\]/g, '').trim()) {
    // Mismo rechazo que `extraer-poliza.ts`: un PDF sin capa de texto no se lee. Aquí no hay visión.
    return {
      ok: false,
      motivo: 'El PDF no tiene texto: parece un escaneo. En esta versión las ofertas escaneadas no se leen: pide a la compañía el PDF original o pasa los datos a mano.',
    }
  }
  let salida: string
  try {
    salida = await iaTextoInyectada(t.texto.slice(0, MAX_TEXTO), {
      system: instruccionOferta(ctx.ramo, ctx.rol),
      maxTokens: MAX_TOKENS,
      timeoutMs: 90_000,
      privado: true,
      categoria: CATEGORIA_IA_OFERTAS,
    })
  } catch (e) {
    console.warn('[asegura] lectura de oferta por IA falló:', e)
    return { ok: false, motivo: `No se ha podido leer la oferta con IA: ${e instanceof Error ? e.message : String(e)}` }
  }
  let bruto: unknown
  try {
    bruto = JSON.parse(cleanJSON(salida))
  } catch {
    return { ok: false, motivo: 'La IA no devolvió un JSON legible: la oferta queda para rellenar a mano.' }
  }
  const r = normalizarOfertaLeida(bruto, ctx.ramo, t.texto)
  if (!r.ok) return r
  return { ok: true, oferta: r.oferta, paginas: t.paginas }
}
