'use server'

// Hermana de `.../decesos-nuevo/acciones.ts` — mismo patrón para SALUD. Desde el 13/10/2026 también monta el cotizador
// EMBEBIDO en la oportunidad (`abrirCotizadorSaludDeOportunidad`, hermana de la de decesos: asegurados desde fichas).
// Una acción de servidor es un POST público: el middleware solo mira la sesión, no la correduría. Toda acción corta
// ANTES de hablar con asegura si no hay acceso a la correduría (`exigirCorreduria`), como hogar y moto.

import {
  precalificarSaludNuevaAsegura,
  cotizarSaludNuevaAsegura,
  catalogoAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionSaludNueva,
  type RespuestaRetarificar,
} from '@/lib/salud-nuevo-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, type VarianteNueva } from '../../../oportunidad/[id]/variante'

const SIN_ACCESO = 'No tienes acceso a la correduría.'

/** La ficha de la persona para salud sin póliza. **Gratis.** */
export async function pedirPrecalificacionSalud(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionSaludNueva> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return precalificarSaludNuevaAsegura(entrada)
}

/** 🚨 **CUESTA 0,50€ REALES.** 🚫 No reintenta. */
export async function pedirCotizacionSalud(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (30/09/2026): la oportunidad de la que cuelga la tarificación. Sin ella, el flujo de siempre. */
  variante?: { oportunidadId: string; nota?: string | null } | null
  /** Recotización EXPLÍCITA tras el aviso de duplicado (0,50€ otra vez). */
  forzar?: boolean
  /** Embebido (13/10/2026): los asegurados son las fichas de las figuras del riesgo; los arma asegura. */
  aseguradosDeFiguras?: boolean
}): Promise<RespuestaRetarificar> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO, gastoDesconocido: false }
  return cotizarSaludNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    forzar: entrada.forzar === true,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    nota: entrada.variante?.nota ?? null,
    aseguradosDeFiguras: entrada.aseguradosDeFiguras === true && !!entrada.variante?.oportunidadId,
  })
}

/** La tarificación de salud de ESA variante del riesgo, para ver sus precios sin pagar otra vez. **Gratis.** */
export async function pedirTarificacionGuardadaSalud(entrada: {
  clienteId: string
  oportunidadId: string
  tarificacionId: string
}): Promise<RespuestaTarificacionNueva> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, 'salud', { oportunidadId: entrada.oportunidadId, tarificacionId: entrada.tarificacionId })
}

export type AperturaCotizadorSalud =
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'ok'
      clienteId: string
      riesgo: Riesgo
      variante: VarianteNueva
      pre: RespuestaPrecalificacionSaludNueva
      civiles: RespuestaCatalogo
    }

/**
 * El bloque «Pedir precio» de una oportunidad de SALUD (13/10/2026): relee el RIESGO en el servidor (lo que hay en
 * asegura ahora, no lo que pinta el navegador), precalifica la ficha del TOMADOR vigente (`tomadorDelRiesgo`) y lee el
 * catálogo de estados civiles, solo al ABRIR el bloque. **Gratis.** Riesgo ilegible o de otro ramo → error: nunca se
 * cotiza a ciegas.
 */
export async function abrirCotizadorSaludDeOportunidad(entrada: { oportunidadId: string }): Promise<AperturaCotizadorSalud> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: SIN_ACCESO }
  const id = typeof entrada?.oportunidadId === 'string' ? entrada.oportunidadId.trim() : ''
  if (id === '' || id.length > 80) return { estado: 'error', mensaje: 'Falta la oportunidad.' }
  const r = await riesgoAsegura(id).catch(() => null)
  if (!r) return { estado: 'error', mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== 'salud') return { estado: 'error', mensaje: 'Este riesgo no es de salud.' }
  const clienteId = tomadorDelRiesgo(l.riesgo)
  const [pre, civiles] = await Promise.all([
    precalificarSaludNuevaAsegura({ clienteId }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
  ])
  return { estado: 'ok', clienteId, riesgo: l.riesgo, variante: varianteDeRiesgo(l.riesgo, clienteId, null), pre, civiles }
}
