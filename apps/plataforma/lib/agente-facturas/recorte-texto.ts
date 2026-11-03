// Recorte del texto de un PDF antes de mandarlo a la IA de extracción. Módulo PURO.
//
// 🚨 Por qué (03/11/2026). La extracción mandaba `texto.slice(0, 4000)`: solo el ENCABEZADO. En las
// liquidaciones de las aseguradoras, lo que dice que Alberto es el COMISIONISTA (código de mediador,
// «comisión», «liquidación») va a menudo en el pie o en la 2.ª página; en las facturas con muchas
// líneas, el total y la forma de pago van al final. La IA no podía «leer el documento completo»
// porque no se lo dábamos. Ahora va mucho más texto y, si aún no cabe, el principio Y el final
// (donde están emisor/destinatario y totales/pie), marcando el corte.

export const MAX_TEXTO_EXTRACCION = 12_000
/** Parte del presupuesto que se reserva al FINAL del documento cuando hay que recortar. */
const FRACCION_FINAL = 1 / 3

export const MARCA_CORTE = '\n[… texto intermedio omitido …]\n'

export function recortarTextoDocumento(texto: string, max = MAX_TEXTO_EXTRACCION): string {
  const t = (texto ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  if (t.length <= max) return t
  const util = Math.max(0, max - MARCA_CORTE.length)
  const fin = Math.floor(util * FRACCION_FINAL)
  return t.slice(0, util - fin) + MARCA_CORTE + t.slice(t.length - fin)
}
