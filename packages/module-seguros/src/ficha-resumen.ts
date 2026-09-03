/**
 * El TITULAR de la ficha del cliente de la correduría — puro y testeado.
 *
 * La ficha pasó de una lista larga a «cabecera + pestañas», y la cabecera es lo
 * único que Alberto mira antes de descolgar el teléfono. Esa lógica vivía
 * incrustada en el JSX de `apps/plataforma/app/(usuario)/correduria/cliente/[id]/page.tsx`;
 * aquí baja entera, porque la regla global del monorepo es que la lógica del
 * titular vive en un helper puro y con test, no en la pantalla.
 *
 * 🚨 Lo que este archivo defiende, y es la razón de que exista: **`null` no es
 * `0`**. Cada contador de la cabecera puede estar en tres estados —«no se ha
 * mirado», «se miró y no hay», «hay N»— y colapsar el primero en el segundo
 * pinta un «todo al día» sobre justo lo que nadie ha comprobado. Medido en la
 * cartera real: 18 de las 109 pólizas vivas no tienen NI UN recibo en la base
 * (la compañía no los ha mandado), y `ficha.siniestros` llega a `null` cuando
 * el puerto de asegura no responde. Los dos casos se dicen con «—», nunca con
 * un cero.
 *
 * Todo es puro: sin BD, sin red, sin reloj. `hoy` entra por parámetro para que
 * los tests fijen el día.
 */

import { diasHastaVencimiento, fechaLimiteOposicion } from './vencimientos.ts'
import { estadoDocumento } from './documentos.ts'
import type { RecibosPoliza } from './recibos.ts'

/**
 * En qué cubo cae una póliza de la ficha.
 *
 * «Viva» NO es solo `viva`: exige además que CIMA la haya confirmado y que no
 * esté cancelada. 42 de las 109 que entran por CIMA están CANCELADAS (medido
 * 02/09/2026): mezclarlas infla «pólizas vivas» y pone un botón «Retarificar»
 * sobre un seguro que ya no existe. Y una emitida por nosotros que CIMA aún no
 * ha traído es `pendiente_cima` —no viva, y no genera avisos—, que es cosa
 * distinta de estar cancelada (docs/CORREDURIA-CRM-VISION.md §5).
 */
export type ClasePolizaFicha = 'viva' | 'pendiente_cima' | 'cancelada' | 'historica'

export type PolizaResumible = {
  id: string
  viva: boolean
  confirmadaCima: boolean
  estado: string
  /** ISO `YYYY-MM-DD`. `null` = la póliza no tiene fecha registrada (1.194 así en la cartera). */
  fechaVencimiento: string | null
  /**
   * Recuento de recibos de ESTA póliza, o `null` si la compañía no informa
   * ninguno. Es el subconjunto de `RecibosPoliza` que necesita la cabecera.
   */
  recibos: Pick<RecibosPoliza, 'total' | 'pendientes' | 'devueltos'> | null
}

/** Clasifica UNA póliza. Mismo orden y misma semántica que tenía el JSX. */
export function clasificarPolizaFicha(p: PolizaResumible): ClasePolizaFicha {
  if (!p.viva) return 'historica'
  if (!p.confirmadaCima) return 'pendiente_cima'
  // `.trim()`: un espacio de más en el enum no puede esconder una cancelada.
  if ((p.estado ?? '').trim() === 'cancelada') return 'cancelada'
  return 'viva'
}

/**
 * El vencimiento que manda en la cabecera, con su plazo legal.
 *
 * `limiteAviso` es vencimiento − 30 días: el preaviso del TOMADOR para oponerse
 * a la prórroga (LCS 50/1980 art. 22). Pasado ese día la póliza se prorroga sí
 * o sí, así que `enPlazo: false` no significa «tarde para todo», significa
 * «este año ya no se puede mover a otra compañía».
 */
export type ProximoVencimiento = {
  polizaId: string
  /** ISO. */
  vencimiento: string
  /** ISO: `vencimiento` − 30 días (LCS art. 22). */
  limiteAviso: string
  /** Días naturales de `hoy` al vencimiento. Negativo si ya venció. */
  diasHastaVencimiento: number
  /** Días naturales de `hoy` al límite de oposición. Negativo si ya pasó. */
  diasHastaLimiteAviso: number
  /** Aún se puede oponer a la prórroga. */
  enPlazo: boolean
}

export type ResumenFicha = {
  conteo: {
    vivas: number
    pendientesCima: number
    canceladas: number
    historicas: number
    total: number
  }
  recibos: {
    /** `null` = NINGUNA póliza informa recibos → la UI pinta «—», no un 0. */
    devueltos: number | null
    /** `null` = ídem. */
    pendientes: number | null
    /** Pólizas cuyo `recibos` es `null`: la compañía no ha mandado nada. */
    polizasSinInformar: number
    /** Informan, pero con `total === 0`: no se sabe si están pagadas. */
    polizasSinRecibos: number
  }
  /** `null` = no se pudieron leer los siniestros. Jamás 0 por un fallo. */
  siniestrosAbiertos: number | null
  /** `null` = documentos no informados; si no, los que están en estado `pedido`. */
  documentosPendientes: number | null
  /** El vencimiento más cercano entre las VIVAS con fecha. `null` si ninguna la tiene. */
  proximo: ProximoVencimiento | null
  /** Vivas sin fecha de vencimiento utilizable: «no se sabe cuándo vence». */
  vivasSinFechaVencimiento: number
}

/**
 * Convierte una fecha ISO de la base en `Date` UTC, o `null`.
 *
 * Estricto a propósito: además de rechazar lo que no parsea, comprueba el
 * viaje de ida y vuelta, así que un `2026-02-30` (que `Date` desliza a marzo)
 * cuenta como «sin fecha» en vez de colarse como un vencimiento inventado. Una
 * fecha basura NUNCA revienta la ficha: se trata como dato que falta.
 */
function fechaUtc(iso: string | null): Date | null {
  if (typeof iso !== 'string') return null
  const dia = iso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const d = new Date(`${dia}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === dia ? d : null
}

function ventanaDe(polizaId: string, vencimiento: Date, hoy: Date): ProximoVencimiento {
  const limite = fechaLimiteOposicion(vencimiento)
  const diasLimite = diasHastaVencimiento(limite, hoy)
  return {
    polizaId,
    vencimiento: vencimiento.toISOString().slice(0, 10),
    limiteAviso: limite.toISOString().slice(0, 10),
    diasHastaVencimiento: diasHastaVencimiento(vencimiento, hoy),
    diasHastaLimiteAviso: diasLimite,
    enPlazo: diasLimite >= 0,
  }
}

/**
 * Resume la ficha entera para la cabecera.
 *
 * `siniestros` y `documentos` aceptan `null` a propósito: es lo que llega
 * cuando la consulta falla o el puerto no lo informa, y ese `null` viaja hasta
 * la pantalla en vez de convertirse en un 0 tranquilizador.
 */
export function resumenFicha(entrada: {
  polizas: PolizaResumible[]
  siniestros: { abierto: boolean }[] | null
  documentos: { estado: string }[] | null
  /** Por defecto `new Date()`. Parámetro SOLO para los tests: la función es pura. */
  hoy?: Date
}): ResumenFicha {
  const hoy = entrada.hoy ?? new Date()
  const polizas = entrada.polizas

  let vivas = 0
  let pendientesCima = 0
  let canceladas = 0
  let historicas = 0
  let vivasSinFechaVencimiento = 0

  // Candidatas a «próximo vencimiento»: solo las VIVAS y con fecha utilizable.
  let futuraMasCercana: ProximoVencimiento | null = null
  let vencidaMasReciente: ProximoVencimiento | null = null

  for (const p of polizas) {
    switch (clasificarPolizaFicha(p)) {
      case 'pendiente_cima': pendientesCima++; continue
      case 'cancelada': canceladas++; continue
      case 'historica': historicas++; continue
      case 'viva': vivas++; break
    }
    const v = fechaUtc(p.fechaVencimiento)
    if (v === null) { vivasSinFechaVencimiento++; continue }
    const w = ventanaDe(p.id, v, hoy)
    if (w.diasHastaVencimiento >= 0) {
      // La más cercana en el futuro: el menor número de días.
      if (futuraMasCercana === null || w.diasHastaVencimiento < futuraMasCercana.diasHastaVencimiento) {
        futuraMasCercana = w
      }
    } else if (vencidaMasReciente === null || w.diasHastaVencimiento > vencidaMasReciente.diasHastaVencimiento) {
      // Si TODAS vencieron, se enseña la última —la menos vieja—, y su
      // `enPlazo: false` dice que ya no hay nada que oponer.
      vencidaMasReciente = w
    }
  }

  const conRecibos = polizas.filter(p => p.recibos !== null)
  const sinInformar = polizas.length - conRecibos.length
  // 🚨 Ni una sola póliza informa → «—». Con al menos una que informe, la suma
  // es sobre ESAS, y `polizasSinInformar` dice a cuántas no alcanza el dato.
  const hayInforme = conRecibos.length > 0

  return {
    conteo: { vivas, pendientesCima, canceladas, historicas, total: polizas.length },
    recibos: {
      devueltos: hayInforme ? conRecibos.reduce((s, p) => s + (p.recibos?.devueltos ?? 0), 0) : null,
      pendientes: hayInforme ? conRecibos.reduce((s, p) => s + (p.recibos?.pendientes ?? 0), 0) : null,
      polizasSinInformar: sinInformar,
      polizasSinRecibos: conRecibos.filter(p => (p.recibos?.total ?? 0) === 0).length,
    },
    siniestrosAbiertos: entrada.siniestros === null ? null : entrada.siniestros.filter(s => s.abierto).length,
    // `estadoDocumento` normaliza igual que el resto de la app: un valor que no
    // conoce NO es «pedido», así que la basura de la base no infla el contador.
    documentosPendientes:
      entrada.documentos === null
        ? null
        : entrada.documentos.filter(d => estadoDocumento(d.estado) === 'pedido').length,
    proximo: futuraMasCercana ?? vencidaMasReciente,
    vivasSinFechaVencimiento,
  }
}
