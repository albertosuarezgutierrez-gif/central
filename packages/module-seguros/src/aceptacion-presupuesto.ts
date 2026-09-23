// La ACEPTACIÓN del presupuesto por el cliente (spec 2026-09-21 §2.4, PR 4) y, si se cambia de
// compañía, la anulación de su póliza actual firmada en el mismo acto (decisión de Alberto, 23/09).
//
// 🚨 La firma NO es la contratación. Entre la firma y la emisión la compañía reconfirma el precio y
// puede rechazar; el documento lo dice en su cara, porque es lo que se firma.
//
// 🚨 La carta de anulación de la póliza VIEJA se firma aquí pero NO se manda hasta que la nueva
// conste emitida: mandarla antes deja al cliente sin seguro si la emisión falla. Por defecto a
// VENCIMIENTO: una anulación a mitad de anualidad la compañía no tiene por qué aceptarla.

export type OpcionAceptada = {
  compania: string
  producto: string | null
  primaEur: number
  franquiciaEur: number | null
  firmeza: 'firme' | 'condicionado' | 'estimado'
}

export type PolizaActual = {
  compania: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD` o `null` si no consta. */
  vencimiento: string | null
}

export type DatosAceptacion = {
  tomador: string
  mediador: string
  claveDgsfp: string
  ramo: string
  opcion: OpcionAceptada
  /** `YYYY-MM-DD`. */
  calculadoEl: string
  /** `YYYY-MM-DD`. */
  venceEl: string
  /** `YYYY-MM-DD`: el día en que se compone y se firma. */
  fechaFirma: string
  /** La póliza que sustituye, si se va a anular en el mismo acto. `null` = no se anula ninguna. */
  anula: { compania: string; numeroPoliza: string; fechaEfecto: string } | null
}

const FIRMEZA: Record<OpcionAceptada['firmeza'], string> = {
  firme: 'precio firme de la compañía',
  condicionado: 'precio condicionado a que la compañía lo confirme',
  estimado: 'precio estimado, pendiente de que la compañía lo confirme',
}

function fechaEs(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

/**
 * ¿La opción elegida es de otra compañía que la póliza actual? Se compara por CÓDIGO DGS, nunca por
 * nombre («Occident» y «Catalana Occidente» son la misma; «Mapfre» y «MAPFRE ESPAÑA» también).
 * `null` = no se puede afirmar (falta algún código): entonces NO se firma ninguna anulación, porque
 * anular por error la póliza que el cliente conserva es el peor desenlace posible.
 */
export function esCambioCompania(actualDgs: string | null | undefined, elegidaDgs: string | null | undefined): boolean | null {
  const a = actualDgs?.trim().toUpperCase(), b = elegidaDgs?.trim().toUpperCase()
  if (!a || !b) return null
  return a !== b
}

export type AnulacionPorCambio =
  | { ok: true; tipo: 'sustitucion'; fechaEfecto: string; advertencia: string | null }
  | { ok: false; motivo: string }

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * La anulación de la póliza vieja: a su vencimiento, siempre. Sin vencimiento conocido no se compone
 * (una carta sin fecha de efecto no se puede firmar). Si ya no llega al mes de preaviso del art. 22
 * LCS, se advierte ANTES de firmar: la compañía puede prorrogarla igualmente.
 */
export function anulacionPorCambio(actual: PolizaActual, hoy: Date): AnulacionPorCambio {
  if (!actual.compania?.trim() || !actual.numeroPoliza?.trim()) {
    return { ok: false, motivo: 'A la póliza actual le falta la compañía o el número: la carta no la identificaría.' }
  }
  if (!actual.vencimiento || !/^\d{4}-\d{2}-\d{2}/.test(actual.vencimiento)) {
    return { ok: false, motivo: 'No consta el vencimiento de la póliza actual: no se puede fijar la fecha de la anulación.' }
  }
  const vence = Date.parse(`${actual.vencimiento.slice(0, 10)}T00:00:00Z`)
  const hoyUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  if (vence <= hoyUtc) return { ok: false, motivo: 'La póliza actual ya ha vencido: no hay nada que anular a su vencimiento.' }
  // Un mes natural antes (art. 22): mismo día del mes anterior, ajustado al último si no existe.
  const v = new Date(vence)
  const limite = Date.UTC(v.getUTCFullYear(), v.getUTCMonth() - 1, Math.min(v.getUTCDate(), new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), 0)).getUTCDate()))
  const advertencia = hoyUtc > limite
    ? `Faltan ${Math.round((vence - hoyUtc) / DIA_MS)} días para el vencimiento: ya no se llega al mes de preaviso (art. 22 LCS) y la compañía puede prorrogar la póliza actual.`
    : null
  return { ok: true, tipo: 'sustitucion', fechaEfecto: actual.vencimiento.slice(0, 10), advertencia }
}

/**
 * El texto EXACTO que el cliente firma. Lo que se hashea es esto; cambiar la redacción cambia la
 * huella de las aceptaciones futuras, nunca la de las firmadas (guardan su texto).
 */
export function documentoAceptacion(d: DatosAceptacion): string {
  const o = d.opcion
  const lineas = [
    `Aceptación de presupuesto de seguro de ${d.ramo}`,
    '',
    `Yo, ${d.tomador.trim()}, acepto la opción de ${o.compania}${o.producto ? ` (${o.producto})` : ''} por ${eur(o.primaEur)} al año` +
      `${o.franquiciaEur !== null ? `, con franquicia de ${eur(o.franquiciaEur)}` : ''}; ${FIRMEZA[o.firmeza]}.`,
    `Presupuesto calculado el ${fechaEs(d.calculadoEl)} y válido hasta el ${fechaEs(d.venceEl)}.`,
    '',
    `Con esta aceptación encargo a mi corredor, ${d.mediador} (DGSFP ${d.claveDgsfp}), que tramite la contratación. ` +
      'NO es todavía el contrato: la compañía tiene que confirmar el precio y emitir la póliza, y no hay cobertura hasta que la emita y se me comunique.',
  ]
  if (d.anula) {
    lineas.push(
      '',
      `Pido también que se anule mi póliza actual de ${d.anula.compania}, nº ${d.anula.numeroPoliza}, con efecto el ${fechaEs(d.anula.fechaEfecto)}, ` +
        'por sustituirse por la nueva. Esa anulación solo se comunicará a la compañía cuando la nueva póliza esté emitida.',
    )
  }
  lineas.push('', `Firmado electrónicamente el ${fechaEs(d.fechaFirma)}.`, d.tomador.trim())
  return lineas.join('\n')
}
