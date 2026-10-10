'use server'

// Las acciones de servidor de la pantalla de «presupuesto de auto sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Mismo patrón, mismo motivo, que
// `.../poliza/[id]/retarificar/acciones.ts` — léela para el porqué completo
// (el Bearer no puede bajar al navegador, una acción de servidor es POST por
// construcción, y a la sesión la protege el middleware, no este fichero).
//
// ⏱️ `maxDuration` vive en `page.tsx`, no aquí: una acción de servidor corre
// dentro del segmento de ruta de su página.

import {
  catalogoAsegura,
  precalificarAutoNuevaAsegura,
  cotizarAutoNuevaAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionAutoNueva,
  type RespuestaRetarificar,
} from '@/lib/auto-nuevo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, type VarianteNueva } from '../../../oportunidad/[id]/variante'
import { datosCotizadorAuto, type DatosCotizadorAuto } from './datos-cotizador'

const SIN_ACCESO = 'No tienes acceso a la correduría.'

/** Un catálogo del vendor (marcas, modelos, motores, versiones…). **Gratis.** */
export async function pedirCatalogo(params: Record<string, string>): Promise<RespuestaCatalogo> {
  return catalogoAsegura(params)
}

/** La ficha de la persona (municipios, estado civil, huecos, consumo). **Gratis.** */
export async function pedirPrecalificacionAuto(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionAutoNueva> {
  // Lee la ficha (estado civil, municipios): sin acceso a la correduría, nada (una acción es un POST público). Igual que moto.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return precalificarAutoNuevaAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarAutoNuevaAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionAuto(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (29/09/2026): la oportunidad, sus figuras (rol → ficha) y la nota. */
  variante?: { oportunidadId: string; figuras?: Record<string, string>; nota?: string | null } | null
  /** Seguro anterior (vehículo nuevo, 03/10/2026): la póliza elegida por el corredor, o `sinSeguroAnterior`. */
  seguroAnteriorId?: string | null
  sinSeguroAnterior?: boolean
  /** Recotización EXPLÍCITA tras el aviso de duplicado (0,50€ otra vez). */
  forzar?: boolean
}): Promise<RespuestaRetarificar> {
  // 0,50€ reales: una acción de servidor es un POST que cualquiera con sesión de plataforma puede lanzar (el
  // middleware solo mira la sesión, no la correduría). Sin acceso, se corta ANTES de hablar con asegura (10/10/2026,
  // como moto desde el 07/10: ahora también se llama desde el bloque «Pedir precio» de la oportunidad).
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO, gastoDesconocido: false }
  return cotizarAutoNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    forzar: entrada.forzar === true,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    figuras: entrada.variante?.figuras ?? null,
    nota: entrada.variante?.nota ?? null,
    seguroAnteriorId: entrada.seguroAnteriorId ?? null,
    sinSeguroAnterior: entrada.sinSeguroAnterior === true,
  })
}

/**
 * La tarificación de auto guardada de ESTE riesgo (y, si viene, de esa variante), para retomarla
 * sin pagar otra vez. **Gratis.** Sin `oportunidadId` no se busca: la «última del cliente» podría
 * ser de otro coche, y eso aquí no se ofrece.
 */
export async function pedirTarificacionGuardadaAuto(entrada: {
  clienteId: string
  oportunidadId: string
  tarificacionId?: string | null
}): Promise<RespuestaTarificacionNueva> {
  // Precios y proyecto ya pagados de un cliente (y la vía a emitirlos): solo con acceso a la correduría.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, 'auto', {
    oportunidadId: entrada.oportunidadId,
    tarificacionId: entrada.tarificacionId ?? null,
  })
}

export type AperturaCotizadorAuto =
  | { estado: 'error'; mensaje: string }
  | { estado: 'ok'; clienteId: string; riesgo: Riesgo; variante: VarianteNueva; datos: DatosCotizadorAuto }

/**
 * El bloque «Pedir precio» de una oportunidad de AUTO (10/10/2026, igual que `abrirCotizadorMotoDeOportunidad`):
 * relee el RIESGO en el servidor (lo que hay en asegura ahora, no lo que pinta el navegador) y lo que el cotizador
 * necesita, solo al ABRIR el bloque. **Gratis.** El tomador es el VIGENTE del riesgo (`tomadorDelRiesgo`). Riesgo
 * ilegible o de otro ramo → error: nunca se cotiza a ciegas (las figuras se perderían sin que nada lo dijera).
 */
export async function abrirCotizadorAutoDeOportunidad(entrada: { oportunidadId: string }): Promise<AperturaCotizadorAuto> {
  // Una acción de servidor es un POST público: no la protege el middleware de las páginas. Sin acceso a la
  // correduría no se lee ni el riesgo ni la ficha.
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: SIN_ACCESO }
  const id = typeof entrada?.oportunidadId === 'string' ? entrada.oportunidadId.trim() : ''
  if (id === '' || id.length > 80) return { estado: 'error', mensaje: 'Falta la oportunidad.' }
  const r = await riesgoAsegura(id).catch(() => null)
  if (!r) return { estado: 'error', mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== 'auto') return { estado: 'error', mensaje: 'Este riesgo no es de auto.' }
  const clienteId = tomadorDelRiesgo(l.riesgo)
  const datos = await datosCotizadorAuto(clienteId, id)
  return { estado: 'ok', clienteId, riesgo: l.riesgo, variante: varianteDeRiesgo(l.riesgo, clienteId, null), datos }
}
