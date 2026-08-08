// ────────────────────────────────────────────────────────────────────────────
// Umbrales legales de APROBACIÓN del remate. Puro: sin red, sin BD.
//
// La confusión que motiva este módulo: «hay que pujar el 70% de la deuda o no
// aceptan la puja». No — en la subasta judicial se puja sobre el VALOR DE
// SUBASTA (el tipo), cualquier postura es admisible (salvo puja mínima
// publicada), y los porcentajes de la LEC condicionan la APROBACIÓN del
// remate, no la admisión de la puja:
//   · art. 670 LEC (con postores): ≥70% del valor de subasta → aprobación
//     automática; ≥50%, o inferior pero cubriendo la cantidad reclamada
//     (principal + intereses + costas), → decide el LAJ oyendo a las partes.
//   · art. 671 LEC (desierta): el ejecutante puede adjudicarse por el 70% si
//     es vivienda habitual (o por la cantidad debida si ≥60%); 50% en otro caso.
//   · subastas administrativas (AEAT/TGSS/otras, art. 97 y ss. RGR): el tipo es
//     la valoración menos las cargas anteriores; la referencia práctica de
//     adjudicación es el 50% del tipo.
// La cantidad reclamada importa además como techo probable de la puja del
// ejecutante: hasta ahí puja sin desembolso real.
// ────────────────────────────────────────────────────────────────────────────

import type { SubastaInmueble } from './types.ts'

/** Régimen que gobierna los umbrales: LEC (judicial/notarial) o RGR. */
export type RegimenSubasta = 'judicial' | 'administrativa'

export interface UmbralPuja {
  clave: 'aprobacion_directa' | 'suelo_laj' | 'deuda'
  importe: number
  /** Fracción del valor de subasta (0.7, 0.5). `null` en el umbral de deuda. */
  pct: number | null
  /** Texto en castellano listo para la ficha o el aviso de Telegram. */
  etiqueta: string
}

export interface UmbralesPuja {
  regimen: RegimenSubasta | null
  valorSubasta: number | null
  cantidadReclamada: number | null
  /** `0` = sin mínimo declarado · `null` = no publicada (tres estados). */
  pujaMinima: number | null
  /** Ascendente por importe. Vacío si no hay valor de subasta o régimen. */
  umbrales: UmbralPuja[]
  notas: string[]
}

const REGIMEN_POR_TIPO: Record<string, RegimenSubasta> = {
  judicial: 'judicial',
  // La subasta notarial remite a las reglas de la LEC.
  notarial: 'judicial',
  agencia_tributaria: 'administrativa',
  seguridad_social: 'administrativa',
  administrativa: 'administrativa',
}

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Umbrales de aprobación del remate para una subasta. Nunca lanza: sin datos
 * devuelve umbrales vacíos con la nota que explica el hueco.
 */
export function umbralesPuja(s: SubastaInmueble): UmbralesPuja {
  const regimen = REGIMEN_POR_TIPO[s.tipo] ?? null
  const valorSubasta = s.valorSubasta ?? null
  const cantidadReclamada = s.cantidadReclamada ?? null
  const pujaMinima = s.pujaMinima ?? null
  const umbrales: UmbralPuja[] = []
  const notas: string[] = []

  if (regimen == null) {
    notas.push(
      s.tipo === 'venta_adjudicado'
        ? 'Venta directa, no una subasta: no hay umbrales de aprobación — el precio se negocia.'
        : 'Régimen especial (concursal u otro): los umbrales de la LEC/RGR no aplican tal cual — revisa las condiciones del procedimiento.',
    )
  } else if (valorSubasta == null || valorSubasta <= 0) {
    notas.push('Sin valor de subasta publicado: no se pueden calcular los umbrales de aprobación.')
  } else if (regimen === 'judicial') {
    umbrales.push({
      clave: 'aprobacion_directa',
      importe: redondear(valorSubasta * 0.7),
      pct: 0.7,
      etiqueta: `Desde ${eur(valorSubasta * 0.7)} (70% del valor de subasta): aprobación automática del remate (art. 670 LEC).`,
    })
    umbrales.push({
      clave: 'suelo_laj',
      importe: redondear(valorSubasta * 0.5),
      pct: 0.5,
      etiqueta: `Desde ${eur(valorSubasta * 0.5)} (50%): el LAJ aprueba salvo que el ejecutado presente mejor postor o el ejecutante pida la adjudicación.`,
    })
    if (cantidadReclamada != null && cantidadReclamada > 0) {
      umbrales.push({
        clave: 'deuda',
        importe: redondear(cantidadReclamada),
        pct: null,
        etiqueta: `Cubrir la cantidad reclamada (${eur(cantidadReclamada)}) también permite aprobar el remate aunque no llegue al 50% — y es el techo probable de la puja del ejecutante.`,
      })
    }
    notas.push(
      'Si la subasta queda desierta, el ejecutante puede adjudicarse el bien por el 70% del valor de subasta si es vivienda habitual (o por lo que se le debe si es ≥60%), y por el 50% en otro caso (art. 671 LEC).',
    )
  } else {
    umbrales.push({
      clave: 'suelo_laj',
      importe: redondear(valorSubasta * 0.5),
      pct: 0.5,
      etiqueta: `Desde ${eur(valorSubasta * 0.5)} (50% del tipo): referencia de adjudicación en subasta administrativa (art. 97 y ss. RGR); por debajo decide la Mesa.`,
    })
  }

  if (pujaMinima === 0) {
    notas.push('Sin puja mínima: cualquier postura es admisible — los umbrales condicionan la APROBACIÓN del remate, no la admisión de la puja.')
  }

  umbrales.sort((a, b) => a.importe - b.importe)
  return { regimen, valorSubasta, cantidadReclamada, pujaMinima, umbrales, notas }
}

/** Tres estados de la puja mínima — el 0 NO es un null (ver `types.ts`). */
export type EstadoPujaMinima = 'publicada' | 'sin_minimo' | 'no_publicada'

export function estadoPujaMinima(v: number | null | undefined): EstadoPujaMinima {
  if (v == null) return 'no_publicada'
  return v === 0 ? 'sin_minimo' : 'publicada'
}
