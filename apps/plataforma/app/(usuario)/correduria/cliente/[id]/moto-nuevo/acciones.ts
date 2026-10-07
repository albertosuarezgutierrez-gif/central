'use server'

// Las acciones de servidor de la pantalla de «presupuesto de moto sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Hermana de `.../auto-nuevo/acciones.ts` — léela para
// el porqué completo (el Bearer no puede bajar al navegador, una acción de
// servidor es POST por construcción, y a la sesión la protege el middleware,
// no este fichero).

import {
  catalogoAsegura,
  precalificarMotoNuevaAsegura,
  cotizarMotoNuevaAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionMotoNueva,
  type RespuestaRetarificar,
} from '@/lib/moto-nuevo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, type VarianteNueva } from '../../../oportunidad/[id]/variante'
import { datosCotizadorMoto, type DatosCotizadorMoto } from './datos-cotizador'

const SIN_ACCESO = 'No tienes acceso a la correduría.'

/** Un catálogo del vendor (marcas, modelos, versiones, experiencia…). **Gratis.** */
export async function pedirCatalogo(params: Record<string, string>): Promise<RespuestaCatalogo> {
  return catalogoAsegura(params)
}

/** La ficha de la persona (municipios, estado civil, huecos, consumo). **Gratis.** */
export async function pedirPrecalificacionMoto(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionMotoNueva> {
  // Lee la ficha (estado civil, municipios): sin acceso a la correduría, nada (una acción es un POST público).
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return precalificarMotoNuevaAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarMotoNuevaAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionMoto(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (29/09/2026): la oportunidad, sus figuras (rol → ficha) y la nota. Sin ocasional: moto no lo admite. */
  variante?: { oportunidadId: string; figuras?: Record<string, string>; nota?: string | null } | null
  /** Seguro anterior (vehículo nuevo, 03/10/2026): la póliza elegida por el corredor, o `sinSeguroAnterior`. */
  seguroAnteriorId?: string | null
  sinSeguroAnterior?: boolean
}): Promise<RespuestaRetarificar> {
  // 0,50€ reales: una acción de servidor es un POST que cualquiera con sesión de plataforma puede lanzar (el
  // middleware solo mira la sesión, no la correduría). Sin acceso, se corta ANTES de hablar con asegura.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO, gastoDesconocido: false }
  return cotizarMotoNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    figuras: entrada.variante?.figuras ?? null,
    nota: entrada.variante?.nota ?? null,
    seguroAnteriorId: entrada.seguroAnteriorId ?? null,
    sinSeguroAnterior: entrada.sinSeguroAnterior === true,
  })
}

/**
 * La última tarificación de moto de este cliente, para retomarla sin pagar otra vez. **Gratis.**
 * Con `oportunidadId` (variante de un riesgo) busca la de ESE riesgo y, con `tarificacionId`,
 * esa variante concreta — no la última del cliente, que podría ser de otra moto.
 */
export async function pedirTarificacionGuardadaMoto(entrada: {
  clienteId: string
  oportunidadId?: string | null
  tarificacionId?: string | null
}): Promise<RespuestaTarificacionNueva> {
  // Precios y proyecto ya pagados de un cliente (y la vía a emitirlos): solo con acceso a la correduría.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return tarificacionNuevaGuardadaAsegura(
    entrada.clienteId,
    'moto',
    entrada.oportunidadId ? { oportunidadId: entrada.oportunidadId, tarificacionId: entrada.tarificacionId ?? null } : undefined,
  )
}

export type AperturaCotizadorMoto =
  | { estado: 'error'; mensaje: string }
  | { estado: 'ok'; clienteId: string; riesgo: Riesgo; variante: VarianteNueva; datos: DatosCotizadorMoto }

/**
 * El bloque «Pedir precio» de una oportunidad de MOTO (07/10/2026): relee el RIESGO en el servidor (lo que hay en
 * asegura ahora, no lo que pinta el navegador) y lo que el cotizador necesita, solo al ABRIR el bloque. **Gratis.**
 * El tomador es el VIGENTE del riesgo (`tomadorDelRiesgo`), como en `rutaVariante`. Riesgo ilegible o de otro ramo →
 * error: nunca se cotiza a ciegas (las figuras se perderían sin que nada lo dijera).
 */
export async function abrirCotizadorMotoDeOportunidad(entrada: { oportunidadId: string }): Promise<AperturaCotizadorMoto> {
  // Una acción de servidor es un POST público: no la protege el middleware de las páginas. Sin acceso a la
  // correduría no se lee ni el riesgo ni la ficha (mismo criterio que `pedirFichaParaEditar`).
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: 'No tienes acceso a la correduría.' }
  const id = typeof entrada?.oportunidadId === 'string' ? entrada.oportunidadId.trim() : ''
  if (id === '' || id.length > 80) return { estado: 'error', mensaje: 'Falta la oportunidad.' }
  const r = await riesgoAsegura(id).catch(() => null)
  if (!r) return { estado: 'error', mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== 'moto') return { estado: 'error', mensaje: 'Este riesgo no es de moto.' }
  const clienteId = tomadorDelRiesgo(l.riesgo)
  const datos = await datosCotizadorMoto(clienteId, id)
  return { estado: 'ok', clienteId, riesgo: l.riesgo, variante: varianteDeRiesgo(l.riesgo, clienteId, null), datos }
}
