// Reglas PURAS de lo que la comparativa sabe de cada precio de bot (26/10/2026). Test: `proyecto-comparativa-reglas.test.ts`.
import { claveRpaDeFila } from './presupuesto-rpa-reglas.ts'
import {
  caducidadProyecto, estadoCaducidad, marcaPrecio, verificacionDeJson,
  type EstadoCaducidad, type MarcaPrecio, type OrigenCaducidad, type VerificacionPdf,
} from './proyecto-pdf-reglas.ts'

export type InfoOfertaBot = {
  ofertaId: string
  compania: string | null
  /** Nº del proyecto en la compañía (`referenciaPortal`). `null` = no consta. */
  referencia: string | null
  guardadoEn: string | null
  caduca: string | null
  origenCaducidad: OrigenCaducidad
  estadoCaducidad: EstadoCaducidad
  /** `null` = no comprobado. */
  verificacion: VerificacionPdf | null
  /** `null` = no se pudieron mirar sus avisos. */
  precio: MarcaPrecio | null
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const ISO = /^\d{4}-\d{2}-\d{2}$/

export type FilaBot = { id: string; compania: string | null; datosExtra: unknown }

/** PURO: une la fila de la oferta con lo que dice la BD de su tarificación. */
export function infoOfertaBot(
  f: FilaBot, t: { guardadoEn: string | null; proyectoPdf: unknown } | null, hoy: string,
): InfoOfertaBot | null {
  if (!claveRpaDeFila(f.datosExtra)) return null
  const x = obj(f.datosExtra) ?? {}
  const pdf = obj(t?.proyectoPdf)
  const cad = caducidadProyecto({
    guardadoEn: t?.guardadoEn ?? null,
    compania: f.compania ?? '',
    validoHastaPdf: typeof pdf?.validoHasta === 'string' && ISO.test(pdf.validoHasta) ? pdf.validoHasta : null,
    validezDiasPdf: typeof pdf?.validezDias === 'number' && Number.isInteger(pdf.validezDias) ? pdf.validezDias : null,
    validaHastaPortal: typeof x.validezHasta === 'string' && ISO.test(x.validezHasta) ? x.validezHasta : null,
  })
  return {
    ofertaId: f.id, compania: f.compania, referencia: txt(x.referenciaPortal), guardadoEn: t?.guardadoEn ?? null,
    caduca: cad.caduca, origenCaducidad: cad.origen, estadoCaducidad: estadoCaducidad(cad.caduca, hoy),
    verificacion: verificacionDeJson(pdf?.verificacion), precio: marcaPrecio(x.avisos, x.supuestos),
  }
}

