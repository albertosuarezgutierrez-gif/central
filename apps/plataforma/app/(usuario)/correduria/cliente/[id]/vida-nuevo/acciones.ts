'use server'

// Acciones de servidor de VIDA (pantalla `vida-nuevo` y, desde el 13/10/2026, el cotizador EMBEBIDO en la oportunidad:
// `abrirCotizadorVidaDeOportunidad`, hermana de la de decesos). El Bearer no baja al navegador.
// Una acción de servidor es un POST público: el middleware solo mira la sesión, no la correduría. Toda acción corta
// ANTES de hablar con asegura si no hay acceso a la correduría (`exigirCorreduria`), como hogar y moto.

import {
  precalificarVidaNuevaAsegura,
  cotizarVidaNuevaAsegura,
  catalogoAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionVidaNueva,
  type RespuestaRetarificar,
} from '@/lib/vida-nuevo-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, type VarianteNueva } from '../../../oportunidad/[id]/variante'

const SIN_ACCESO = 'No tienes acceso a la correduría.'

/** La ficha de la persona para vida sin póliza. **Gratis.** */
export async function pedirPrecalificacionVida(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionVidaNueva> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return precalificarVidaNuevaAsegura(entrada)
}

/** 🚨 **CUESTA 0,50€ REALES.** 🚫 No reintenta. */
export async function pedirCotizacionVida(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (30/09/2026): la oportunidad de la que cuelga la tarificación. Sin ella, el flujo de siempre. */
  variante?: { oportunidadId: string; nota?: string | null } | null
  /** Recotización EXPLÍCITA tras el aviso de duplicado (0,50€ otra vez). */
  forzar?: boolean
  /** Embebido (13/10/2026): capital, profesión y fumador los lee asegura de «Datos del riesgo» (no viajan desde aquí). */
  datosDelRiesgo?: boolean
}): Promise<RespuestaRetarificar> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO, gastoDesconocido: false }
  return cotizarVidaNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    forzar: entrada.forzar === true,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    nota: entrada.variante?.nota ?? null,
    datosDelRiesgo: entrada.datosDelRiesgo === true && !!entrada.variante?.oportunidadId,
  })
}

/** La tarificación de vida de ESA variante del riesgo, para ver sus precios sin pagar otra vez. **Gratis.** */
export async function pedirTarificacionGuardadaVida(entrada: {
  clienteId: string
  oportunidadId: string
  tarificacionId: string
}): Promise<RespuestaTarificacionNueva> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, 'vida', { oportunidadId: entrada.oportunidadId, tarificacionId: entrada.tarificacionId })
}

export type AperturaCotizadorVida =
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'ok'
      clienteId: string
      riesgo: Riesgo
      variante: VarianteNueva
      pre: RespuestaPrecalificacionVidaNueva
      civiles: RespuestaCatalogo
    }

/**
 * El bloque «Pedir precio» de una oportunidad de VIDA (13/10/2026): relee el RIESGO en el servidor (lo que hay en
 * asegura ahora, no lo que pinta el navegador), precalifica la ficha del TOMADOR vigente (`tomadorDelRiesgo`) y lee el
 * catálogo de estados civiles, solo al ABRIR el bloque. **Gratis.** Riesgo ilegible o de otro ramo → error: nunca se
 * cotiza a ciegas.
 */
export async function abrirCotizadorVidaDeOportunidad(entrada: { oportunidadId: string }): Promise<AperturaCotizadorVida> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: SIN_ACCESO }
  const id = typeof entrada?.oportunidadId === 'string' ? entrada.oportunidadId.trim() : ''
  if (id === '' || id.length > 80) return { estado: 'error', mensaje: 'Falta la oportunidad.' }
  const r = await riesgoAsegura(id).catch(() => null)
  if (!r) return { estado: 'error', mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== 'vida') return { estado: 'error', mensaje: 'Este riesgo no es de vida.' }
  const clienteId = tomadorDelRiesgo(l.riesgo)
  const [pre, civiles] = await Promise.all([
    precalificarVidaNuevaAsegura({ clienteId }),
    catalogoAsegura({ tipo: 'estados-civiles' }),
  ])
  return { estado: 'ok', clienteId, riesgo: l.riesgo, variante: varianteDeRiesgo(l.riesgo, clienteId, null), pre, civiles }
}
