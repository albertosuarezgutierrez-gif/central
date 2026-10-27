// VOLCADO INICIAL (27/10/2026) — la IA PROPONE la estructura del patrimonio a partir de una hoja (ya leída y SIN columnas de
// identificadores), un PDF (texto) o una foto (visión). Patrón de `extraer-factura.ts`: solo OpenRouter con privacidad, sin
// cadena de suplentes. La normalización (qué es dato y qué es «no lo sé») vive en `normalizarVolcadoLeido`
// (@central/module-patrimonio), pura y con test: aquí solo se pregunta y se interpreta el JSON.
//
// Sin clave, fallo de la IA o PDF sin texto = `leido: false` con su motivo: «no se ha podido leer», que NO es «el documento
// no trae nada». Nada de lo que devuelve esta función se escribe en el patrimonio: queda como PROPUESTA hasta que el
// cliente la revisa y la confirma.
import { cleanJSON, openrouterChat, openrouterVision } from '@central/core-ai'
import { CATEGORIAS_GASTO, normalizarVolcadoLeido, type PropuestaVolcado } from '@central/module-patrimonio'
import { modelosLecturaPoliza } from '@central/module-seguros'

import type { Hoja } from './importacion-lectura'

export type ResultadoVolcado = { leido: true; propuesta: PropuestaVolcado; motivos: string[] } | { leido: false; motivos: string[] }

/** Texto máximo que se manda a la IA (una hoja de 500 filas cabe holgada; un PDF largo se recorta y se dice). */
export const MAX_TEXTO_IA = 60_000

const INSTRUCCION = `Eres un asistente que ordena el patrimonio inmobiliario de un propietario español a partir de su hoja de cálculo o de sus documentos (contratos de alquiler, recibos, listados).
Devuelve SOLO un JSON con esta forma:
{"inmuebles":[{"ref":string,"nombre":string|null,"uso":"edificio"|"vivienda"|"local"|"oficina"|"nave"|"garaje"|"trastero"|null,"edificio":string|null,"referencia_catastral":string|null,"direccion":string|null,"cp":string|null,"municipio":string|null,"provincia":string|null,"superficie_m2":number|null}],
 "contratos":[{"inmueble":string,"inquilino":string|null,"inquilino_tipo":"persona"|"sociedad"|null,"inicio":"YYYY-MM-DD"|null,"fin":"YYYY-MM-DD"|null,"renta_mensual":number|null,"fianza":number|null,"actualizacion":"IPC"|"IRAV"|null}],
 "gastos":[{"inmueble":string|null,"concepto":string,"categoria":${CATEGORIAS_GASTO.filter((c) => c !== 'OTRO').map((c) => `"${c}"`).join('|')}|null,"periodicidad":"mensual"|"trimestral"|"semestral"|"anual"|null,"importe":number|null,"dia_mes":number|null,"inicio":"YYYY-MM-DD"|null}]}
Reglas:
- Si todos los pisos/locales están en UN edificio sin división horizontal (una sola referencia catastral para todo), crea un inmueble con uso "edificio" y cada piso como inmueble con "edificio" = la ref del edificio. Si cada piso tiene su propia referencia catastral, son inmuebles sueltos (sin "edificio").
- "ref" es un identificador corto que tú inventas (E1, P1…); "inmueble" en contratos y gastos es la ref de su inmueble.
- "gastos" son SOLO los gastos que se repiten (IBI, comunidad, seguro, basura, gestoría…), uno por concepto e inmueble, no cada recibo.
- Importes en euros con punto decimal, sin símbolo. La renta es la MENSUAL.
- Del inquilino pon SOLO su nombre. NUNCA copies DNI, NIF, NIE, teléfonos, correos, IBAN ni cuentas bancarias de nadie.
- Si un dato no aparece, pon null. NUNCA inventes ni pongas 0, "N/A" u "otro" cuando no lo sepas.`

const MODELO = () => ({ models: modelosLecturaPoliza(process.env), privacidad: true })

/** Hoja → texto tabular para la IA (las columnas de identificadores ya vienen VACÍAS de `leerHojaVolcado`). */
export function hojaComoTexto(hoja: Hoja): { texto: string; recortada: boolean } {
  const usadas = hoja.cabeceras.map((_, k) => hoja.filas.some((f) => f[k] !== null && f[k] !== undefined))
  const col = (f: readonly unknown[]) => f.filter((_, k) => usadas[k]).map((c) => (c === null || c === undefined ? '' : String(c).replace(/[|\r\n]+/g, ' '))).join(' | ')
  const lineas = [col(hoja.cabeceras), ...hoja.filas.map(col)]
  let texto = ''
  let recortada = false
  for (const l of lineas) {
    if (texto.length + l.length + 1 > MAX_TEXTO_IA) { recortada = true; break }
    texto += `${l}\n`
  }
  return { texto, recortada }
}

function interpretar(salida: string, motivos: string[]): ResultadoVolcado {
  let bruto: unknown
  try {
    bruto = JSON.parse(cleanJSON(salida))
  } catch {
    return { leido: false, motivos: [...motivos, 'La lectura automática no devolvió datos utilizables.'] }
  }
  const r = normalizarVolcadoLeido(bruto)
  return { leido: true, propuesta: r.propuesta, motivos: [...motivos, ...r.motivos] }
}

const clave = () => (process.env.OPENROUTER_API_KEY ?? '').trim()
const SIN_IA = 'La lectura automática no está disponible ahora. Usa «Importar desde Excel» por tipo de dato o da de alta a mano.'

export async function proponerDesdeHoja(hoja: Hoja): Promise<ResultadoVolcado> {
  const apiKey = clave()
  if (!apiKey) return { leido: false, motivos: [SIN_IA] }
  const { texto, recortada } = hojaComoTexto(hoja)
  const motivos = recortada ? ['La hoja es muy larga: solo se han leído las primeras filas.'] : []
  try {
    const salida = await openrouterChat({ apiKey }, [{ role: 'user', content: texto }], { system: INSTRUCCION, maxTokens: 12_000, ...MODELO() })
    return interpretar(salida, motivos)
  } catch (e) {
    console.warn('[portal] volcado: openrouterChat falló:', e instanceof Error ? e.name : 'error')
    return { leido: false, motivos: ['La lectura automática ha fallado. Inténtalo más tarde.'] }
  }
}

/** PDF o foto. El tipo llega YA comprobado por los bytes (`tipoRealFactura`). */
export async function proponerDesdeDocumento(buffer: Buffer, mime: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'): Promise<ResultadoVolcado> {
  const apiKey = clave()
  if (mime === 'application/pdf') {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch {
      return { leido: false, motivos: ['No hemos podido abrir el PDF.'] }
    }
    if (!texto.trim()) return { leido: false, motivos: ['El PDF no tiene texto (parece escaneado). Sube una foto nítida de cada página.'] }
    if (!apiKey) return { leido: false, motivos: [SIN_IA] }
    const motivos = texto.length > MAX_TEXTO_IA ? ['El PDF es muy largo: solo se han leído las primeras páginas.'] : []
    try {
      const salida = await openrouterChat({ apiKey }, [{ role: 'user', content: texto.slice(0, MAX_TEXTO_IA) }], { system: INSTRUCCION, maxTokens: 12_000, ...MODELO() })
      return interpretar(salida, motivos)
    } catch (e) {
      console.warn('[portal] volcado: openrouterChat falló:', e instanceof Error ? e.name : 'error')
      return { leido: false, motivos: ['La lectura automática ha fallado. Inténtalo más tarde.'] }
    }
  }
  if (!apiKey) return { leido: false, motivos: [SIN_IA] }
  try {
    const salida = await openrouterVision({ apiKey }, INSTRUCCION, [{ data: buffer.toString('base64'), mediaType: mime }], 'Ordena el patrimonio que aparece en esta imagen.', MODELO())
    return interpretar(salida, [])
  } catch (e) {
    console.warn('[portal] volcado: openrouterVision falló:', e instanceof Error ? e.name : 'error')
    return { leido: false, motivos: ['La lectura automática ha fallado. Inténtalo más tarde.'] }
  }
}
