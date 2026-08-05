// Qué adjunto de un correo es la factura.
//
// 🚨 Por qué existe este módulo (05/08/2026): el agente cogía `adjuntos[0]` y se
// quedaba con él. El aviso de factura de DIGI trae **12 adjuntos**: 11 imágenes
// incrustadas del HTML (`header.png`, `logo-Mi-DIGI.png`, `icon_calendar.png`,
// iconos de redes…) y el PDF de la factura **el último**. El agente analizaba el
// banner publicitario `VoLTE-VoWiFi.png`, y como el banner se lee perfectamente y
// no es una factura, el correo salía «descartado: leído, no era factura». La
// factura de 76,00 € nunca se miró — el peor tipo de error de todos, porque el
// parte del latido lo cantaba como una comprobación hecha.
//
// Módulo PURO (sin '@/' ni IO) → testeable con `node --test`.

export interface AdjuntoCandidato {
  nombre: string
  mime: string
  /** Imagen incrustada en el HTML (`<img src="cid:…">`): decoración, no documento. */
  inline: boolean
}

/** Nombres que delatan maquetación de email, no un documento contable. */
const DECORATIVO =
  /(^|[-_.])(logo|header|footer|banner|icon|icono|spacer|pixel|firma|signature|social|instagram|facebook|twitter|linkedin|youtube|whatsapp|google-play|apple-store|app-?store)([-_.]|$)/i

/** Nombres que delatan una factura de verdad. */
const NOMBRE_FACTURA = /(factura|invoice|recibo|fra[-_. ]|bill|nota[-_. ]?abono|abono)/i

/**
 * Ordena los adjuntos de un correo poniendo primero el que más probablemente es
 * la factura. NO descarta nada: quien llama decide cuántos se permite probar.
 *
 * Criterio, de más a menos peso:
 *   1. adjunto real antes que imagen incrustada del HTML;
 *   2. PDF antes que imagen;
 *   3. nombre que suena a factura antes que nombre neutro;
 *   4. nombre decorativo (logo/header/icon…) al final.
 *
 * Estable: a igualdad de puntuación se respeta el orden original del correo.
 */
export function ordenarAdjuntosFactura<T extends AdjuntoCandidato>(adjuntos: T[]): T[] {
  return adjuntos
    .map((a, i) => ({ a, i, p: puntuar(a) }))
    .sort((x, y) => (y.p - x.p) || (x.i - y.i))
    .map((x) => x.a)
}

function puntuar(a: AdjuntoCandidato): number {
  let p = 0
  if (!a.inline) p += 100
  if (/application\/pdf/i.test(a.mime)) p += 50
  if (NOMBRE_FACTURA.test(a.nombre)) p += 10
  if (DECORATIVO.test(a.nombre)) p -= 20
  return p
}
