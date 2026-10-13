'use server'

// Las dos acciones de servidor de la pantalla de «presupuesto de hogar sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Mismo patrón, mismo motivo, que
// `.../poliza/[id]/retarificar/acciones.ts` — léela para el porqué completo
// (el Bearer no puede bajar al navegador, una acción de servidor es POST por
// construcción, y a la sesión la protege el middleware, no este fichero).
//
// ⏱️ `maxDuration` vive en `page.tsx`, no aquí: una acción de servidor corre
// dentro del segmento de ruta de su página.

import {
  precalificarHogarNuevoAsegura,
  cotizarHogarNuevoAsegura,
  type RespuestaPrecalificacionHogar,
  type RespuestaRetarificar,
} from '@/lib/hogar-nuevo-asegura'
import { inicialesHogarDeRiesgo } from '@central/module-seguros'
import { normalizarReferencia } from '@/lib/correduria-hogar'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo, type Riesgo } from '@/lib/riesgo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'
import { tomadorDelRiesgo, varianteDeRiesgo, viviendaDeRiesgo, type VarianteNueva } from '../../../oportunidad/[id]/variante'
import { propietarioEsTomadorDeRiesgo } from '../../../oportunidad/[id]/cotizador-hogar'

const SIN_ACCESO = 'No tienes acceso a la correduría.'

/** La ficha entera (Catastro + catálogos + resumen). **Gratis.** */
export async function pedirPrecalificacionHogar(entrada: {
  clienteId: string
  referencia: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaPrecalificacionHogar> {
  // Lee la ficha y el Catastro de un cliente: sin acceso a la correduría, nada (una acción es un POST público).
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return precalificarHogarNuevoAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarHogarNuevoAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionHogar(entrada: {
  clienteId: string
  referencia: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (30/09/2026): la oportunidad de la que cuelga la tarificación. Sin ella, el flujo de siempre. */
  variante?: { oportunidadId: string; nota?: string | null } | null
  /** Recotización EXPLÍCITA tras el aviso de duplicado (0,50€ otra vez). */
  forzar?: boolean
}): Promise<RespuestaRetarificar> {
  // 0,50€ reales: una acción de servidor es un POST que cualquiera con sesión de plataforma puede lanzar (el
  // middleware solo mira la sesión, no la correduría). Sin acceso, se corta ANTES de hablar con asegura (como moto).
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO, gastoDesconocido: false }
  return cotizarHogarNuevoAsegura({
    clienteId: entrada.clienteId,
    referencia: entrada.referencia,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    forzar: entrada.forzar === true,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    nota: entrada.variante?.nota ?? null,
  })
}

/** La tarificación de hogar de ESA variante del riesgo, para ver sus precios y emitir sin pagar otra vez. **Gratis.** */
export async function pedirTarificacionGuardadaHogar(entrada: {
  clienteId: string
  oportunidadId: string
  tarificacionId: string
}): Promise<RespuestaTarificacionNueva> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', motivo: 'secreto_rechazado', mensaje: SIN_ACCESO }
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, 'hogar', { oportunidadId: entrada.oportunidadId, tarificacionId: entrada.tarificacionId })
}

export type AperturaCotizadorHogar =
  | { estado: 'error'; mensaje: string }
  | {
      estado: 'ok'
      clienteId: string
      riesgo: Riesgo
      variante: VarianteNueva
      /** `null` = el riesgo aún no tiene referencia catastral: sin ella la ficha de hogar no se puede leer. */
      referencia: string | null
      /** Lo que el riesgo ya sabe de la vivienda, tal cual entra en la ficha (la precalificación ya lo incluye). */
      iniciales: { resueltos: Record<string, unknown>; correcciones: Record<string, unknown> }
      pre: RespuestaPrecalificacionHogar | null
    }

/**
 * El bloque «Pedir precio» de una oportunidad de HOGAR (10/10/2026): relee el RIESGO en el servidor (lo que hay en
 * asegura ahora, no lo que pinta el navegador) y precalifica la ficha con la vivienda del riesgo, solo al ABRIR el
 * bloque. **Gratis** (Catastro + catálogos). El tomador es el VIGENTE del riesgo (`tomadorDelRiesgo`). Riesgo ilegible
 * o de otro ramo → error: nunca se cotiza a ciegas.
 */
export async function abrirCotizadorHogarDeOportunidad(entrada: { oportunidadId: string }): Promise<AperturaCotizadorHogar> {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return { estado: 'error', mensaje: SIN_ACCESO }
  const id = typeof entrada?.oportunidadId === 'string' ? entrada.oportunidadId.trim() : ''
  if (id === '' || id.length > 80) return { estado: 'error', mensaje: 'Falta la oportunidad.' }
  const r = await riesgoAsegura(id).catch(() => null)
  if (!r) return { estado: 'error', mensaje: 'No se ha podido hablar con central-asegura.' }
  const l = interpretarRiesgo(r.status, r.json)
  if (l.estado === 'no_encontrado') return { estado: 'error', mensaje: 'Esta oportunidad no existe o no es de la correduría.' }
  if (l.estado === 'error') return { estado: 'error', mensaje: `No se ha podido leer el riesgo (${l.motivo}).` }
  if (l.riesgo.oportunidad.ramo !== 'hogar') return { estado: 'error', mensaje: 'Este riesgo no es de hogar.' }
  // Sin el bloque de la vivienda (asegura que aún no lo manda) no se sabe qué casa: no se cotiza.
  if (l.riesgo.datosRiesgo === null) return { estado: 'error', mensaje: 'No se han podido leer los datos de la vivienda del riesgo.' }
  const clienteId = tomadorDelRiesgo(l.riesgo)
  const vivienda = viviendaDeRiesgo(l.riesgo)
  const iniciales = inicialesHogarDeRiesgo(vivienda)
  // El propietario de «Intervinientes» manda sobre el supuesto de asegura («el tomador es el dueño»).
  const propietarioEsTomador = propietarioEsTomadorDeRiesgo({ figuras: l.riesgo.figuras, tomadorId: clienteId, propietarioEsTomador: vivienda?.propietarioEsTomador ?? null })
  if (propietarioEsTomador !== null) iniciales.resueltos.propietarioEsTomador = propietarioEsTomador
  const referencia = vivienda?.referenciaCatastral ? normalizarReferencia(vivienda.referenciaCatastral) : null
  const hayIniciales = Object.keys(iniciales.resueltos).length + Object.keys(iniciales.correcciones).length > 0
  const pre = referencia === null
    ? null
    : await precalificarHogarNuevoAsegura({ clienteId, referencia, ...(hayIniciales ? { resueltos: iniciales.resueltos, correcciones: iniciales.correcciones } : {}) })
  return { estado: 'ok', clienteId, riesgo: l.riesgo, variante: varianteDeRiesgo(l.riesgo, clienteId, null), referencia, iniciales, pre }
}
