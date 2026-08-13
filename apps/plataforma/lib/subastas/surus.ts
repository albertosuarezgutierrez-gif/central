// ────────────────────────────────────────────────────────────────────────────
// Adaptador de SURUS IN SITU (surusin.com). Aquí va SOLO la red y la BD; el
// parseo es puro (`@central/module-subastas/surus.ts`).
//
// Surus es un portal privado de subastas electrónicas de activos en liquidación
// (concursal y de fondos): viviendas, naves, suelo y VEHÍCULOS. Alberto se dio
// de alta el 13/08/2026 para recibir sus avisos por correo, así que la ingesta
// va por el MISMO camino que las alertas del BOE: IMAP sobre «Todos los
// mensajes» (`gmail-boe.ts::leerAlertas`, que ya acepta otro remitente), no por
// el triaje de `lib/correo/**` — ese solo mira INBOX y trunca el cuerpo.
//
// 🚨 DECLARACIÓN HONESTA DE LO QUE **NO** ESTÁ VALIDADO
// Cuando se escribió esto no había llegado todavía ningún correo de Surus (alta
// del mismo día), así que la maquetación de sus avisos NO se ha visto. Lo que sí
// está verificado carácter a carácter es el vocabulario de etiquetas de sus
// FICHAS de lote («Precio de salida», «Depósito De Garantía», «Situación
// Posesoria»…), que es lo que este adaptador busca en el texto del correo.
//
// Consecuencia asumida y diseñada: si el aviso no trae esas etiquetas, el lector
// devuelve `null` y el resultado lo CUENTA en `correosSinLeer` — nunca lo
// confunde con «ese día no había subastas». Un aviso que no se supo leer es un
// hueco conocido, no un cero. Cuando llegue el primero, se contrasta el texto
// real contra `test/fixtures-surus.ts` y se ajusta el parser con ESE documento
// delante.
// ────────────────────────────────────────────────────────────────────────────
import {
  DOMINIO_SURUS,
  decodificarHtml,
  loteSurusASubasta,
  parsearLoteSurus,
} from '@central/module-subastas'
import { leerAlertas } from '@/lib/subastas/gmail-boe'
import { upsertSubastas, type SubastaEnriquecida } from '@/lib/subastas-ingesta'

/** Resultado de una pasada. `correosSinLeer` es tan importante como `lotes`. */
export interface IngestaSurus {
  correos: number
  lotes: number
  upserts: number
  /** Correos de Surus de los que NO se pudo extraer ninguna ficha. */
  correosSinLeer: number
  avisos: string[]
}

/**
 * HTML de correo → texto con SALTOS DE LÍNEA conservados. El parser de Surus se
 * apoya en que cada etiqueta va en su línea, así que aplanar el HTML a un solo
 * párrafo (como hace el lector del BOE) lo dejaría ciego.
 */
export function htmlATexto(html: string): string {
  return decodificarHtml(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
      .replace(/<\/t[dh]>/gi, '  ') // celdas: dos espacios = separador de columna
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** URLs de lote de surusin.com que aparecen en el HTML, en orden de aparición. */
export function urlsDeLote(html: string): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]*surusin\.com[^\s"'<>]*/gi)) {
    const url = decodificarHtml(m[0]).replace(/[.,)]+$/, '')
    // Solo enlaces a una ficha concreta: el logo y el pie apuntan a la home.
    if (!/\/(lote|subasta|activo)s?\//i.test(url)) continue
    if (vistas.has(url)) continue
    vistas.add(url)
    out.push(url)
  }
  return out
}

/**
 * Fichas contenidas en UN correo. Un aviso puede traer varios lotes, así que el
 * texto se trocea por los enlaces de ficha; con un solo lote (o ninguno) se
 * intenta leer el correo entero de una pieza.
 */
export function fichasDeCorreo(html: string): SubastaEnriquecida[] {
  const urls = urlsDeLote(html)
  const texto = htmlATexto(html)

  if (urls.length <= 1) {
    const lote = parsearLoteSurus(texto)
    return lote ? [conOrigen(loteSurusASubasta(lote, { url: urls[0] ?? null }))] : []
  }

  // Varios lotes: cada bloque va desde el enlace anterior hasta el siguiente.
  // Es una heurística sobre un formato que aún no hemos visto; por eso lo que
  // no cuaje se queda fuera y se cuenta, en vez de inventar una ficha a medias.
  const out: SubastaEnriquecida[] = []
  const cortes = urls
    .map((u) => ({ url: u, pos: texto.indexOf(u) }))
    .filter((c) => c.pos >= 0)
  for (let i = 0; i < cortes.length; i++) {
    const desde = i === 0 ? 0 : cortes[i - 1].pos
    const hasta = i + 1 < cortes.length ? cortes[i + 1].pos : texto.length
    const lote = parsearLoteSurus(texto.slice(desde, hasta))
    if (lote) out.push(conOrigen(loteSurusASubasta(lote, { url: cortes[i].url })))
  }
  // Si el troceo no dio nada, un último intento con el correo entero.
  if (!out.length) {
    const lote = parsearLoteSurus(texto)
    if (lote) out.push(conOrigen(loteSurusASubasta(lote, { url: urls[0] })))
  }
  return out
}

function conOrigen(s: ReturnType<typeof loteSurusASubasta>): SubastaEnriquecida {
  return { ...s, busquedaOrigen: 'Surus in situ (alerta por correo)' }
}

/**
 * Ingesta de las alertas de Surus del buzón. Best-effort: un fallo aquí no debe
 * tumbar la ingesta del BOE ni de la Junta (el cron la llama en su try/catch).
 */
export async function ingerirSurus(dias = 7, maxCorreos = 60): Promise<IngestaSurus> {
  const avisos: string[] = []
  let correos: Awaited<ReturnType<typeof leerAlertas>>
  try {
    correos = await leerAlertas(dias, maxCorreos, DOMINIO_SURUS)
  } catch (e: any) {
    // No poder abrir el buzón NO es «no hay avisos»: se declara y se sale.
    return { correos: 0, lotes: 0, upserts: 0, correosSinLeer: 0, avisos: [`IMAP: ${e?.message ?? String(e)}`] }
  }

  const subastas: SubastaEnriquecida[] = []
  let correosSinLeer = 0
  for (const c of correos) {
    const fichas = c.html ? fichasDeCorreo(c.html) : []
    if (!fichas.length) {
      correosSinLeer++
      avisos.push(`Sin poder leer: «${(c.subject || '(sin asunto)').slice(0, 80)}» (${c.fecha.toISOString().slice(0, 10)})`)
      continue
    }
    subastas.push(...fichas)
  }

  const upserts = subastas.length ? await upsertSubastas(subastas) : 0
  return { correos: correos.length, lotes: subastas.length, upserts, correosSinLeer, avisos }
}
