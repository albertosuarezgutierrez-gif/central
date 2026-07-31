// ────────────────────────────────────────────────────────────────────────────
// ¿DE ESTA SE AVISA? PURO y determinista.
//
// Política de Alberto (30/07/2026): «que solo me avise de las que sean rentables
// y claras, que no haya cosas raras». Hasta ahora el radar avisaba de todo lo que
// casaba criterios, con la documentación leída o sin leer — así llegó al Telegram
// una parcela de Belmonte anunciada con «55% de descuento» que en realidad
// arrastraba 44.850€ de hipoteca anterior.
//
// Tres salidas, no dos, y la tercera es la que evita el daño:
//   · `avisar`    → rentable y sin banderas rojas conocidas.
//   · `silenciar` → hay algo serio (se hereda carga, está ocupada, es un
//                   proindiviso). Sigue en /subastas para consultarla, pero no
//                   interrumpe.
//   · `esperar`   → todavía no se han leído sus documentos. NO se avisa de algo
//                   sin verificar… salvo que esté a punto de cerrar, porque
//                   perder el plazo también cuesta dinero: entonces se avisa
//                   marcado como sin verificar.
// ────────────────────────────────────────────────────────────────────────────

import type { Nivel } from './analisis.ts'

export type DecisionAviso = 'avisar' | 'silenciar' | 'esperar'

export interface EntradaAviso {
  /** Ya ha pasado el filtro de rentabilidad (chollo, flip viable o playa). */
  rentable: boolean
  /** Semáforo documental, o `null` si aún no se ha calculado. */
  semaforo: Nivel | null
  /**
   * El valor de mercado sale de una zona demasiado gruesa (mediana municipal de
   * una ciudad desigual). «Rentable» calculado contra un número así no es un
   * hecho: es una corazonada con decimales.
   */
  valorOrientativo?: boolean
  /** Lo que heredaría el adjudicatario. `null` = no se ha podido cuantificar. */
  cargasSubsistentes: number | null
  /** ¿Se ha leído de verdad la certificación? */
  cargasConocidas: boolean
  /** Documentos de la ficha ya procesados por el lector. */
  documentosLeidos: boolean
  /** Días hasta el cierre; `null` si no hay fecha. */
  diasParaCierre: number | null
  /** Puntos del análisis documental, para saber QUÉ es lo raro. */
  claves?: string[]
}

export interface ResultadoAviso {
  decision: DecisionAviso
  /** Explicación en una línea, para el log y para el propio aviso. */
  motivo: string
  /** Se avisa pero con la documentación sin verificar (plazo apurado). */
  sinVerificar: boolean
}

/** Con menos días que esto por delante, más vale un aviso imperfecto que ninguno. */
export const DIAS_URGENTE = 4

/** Claves del análisis que descartan una subasta por sí solas. */
const GRAVES = new Set(['proindiviso'])

export function decidirAviso(e: EntradaAviso): ResultadoAviso {
  const no = (motivo: string): ResultadoAviso => ({ decision: 'silenciar', motivo, sinVerificar: false })

  if (!e.rentable) return no('No pasa el filtro de rentabilidad')

  // El valor de mercado es el que manda en «rentable»: si está construido con
  // la mediana de una ciudad entera, la rentabilidad no está comprobada.
  if (e.valorOrientativo) {
    return no('El valor de mercado sale de la mediana de todo el municipio: la rentabilidad no está comprobada')
  }

  // ── Cosas raras que se saben con certeza ──────────────────────────────────
  if (e.cargasSubsistentes != null && e.cargasSubsistentes > 0) {
    return no('Se heredan cargas anteriores: el coste real no es el del anuncio')
  }
  const claves = e.claves ?? []
  if (claves.some((c) => GRAVES.has(c))) {
    return no('Solo se subasta una cuota indivisa (proindiviso)')
  }
  if (e.semaforo === 'rojo') {
    return no('Semáforo documental en rojo')
  }

  const urgente = e.diasParaCierre != null && e.diasParaCierre <= DIAS_URGENTE

  // ── Aún sin verificar ─────────────────────────────────────────────────────
  // Que la certificación exista y no se haya leído no es «limpia»: es «no lo sé».
  if (!e.documentosLeidos || !e.cargasConocidas) {
    if (urgente) {
      return {
        decision: 'avisar',
        motivo: 'Cierra en pocos días y la documentación aún no está verificada: se avisa igualmente',
        sinVerificar: true,
      }
    }
    return { decision: 'esperar', motivo: 'Pendiente de leer la documentación de la ficha', sinVerificar: false }
  }

  // Cargas leídas pero sin poder cuantificar lo que subsiste: no es «clara».
  if (e.cargasSubsistentes == null) {
    if (urgente) {
      return {
        decision: 'avisar',
        motivo: 'Cierra en pocos días y no se ha podido cuantificar la carga que subsiste',
        sinVerificar: true,
      }
    }
    return no('No se ha podido cuantificar qué carga subsiste')
  }

  return {
    decision: 'avisar',
    motivo: e.semaforo === 'verde' ? 'Rentable y documentación clara' : 'Rentable, sin cargas que subsistan y sin banderas graves',
    sinVerificar: false,
  }
}
