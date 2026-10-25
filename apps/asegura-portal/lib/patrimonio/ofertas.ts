// PATRIMONIO (25/10/2026) — OFERTAS que el cliente PULSA: comparar una póliza de otra correduría, proteger la renta de un
// alquiler y revisar los seguros de la hipoteca. Reglas PURAS (sin prisma ni sesión) de qué se enseña y con qué texto.
//
// 🚨 Regla legal: aquí solo hay tarjetas con un BOTÓN. El cliente pide; nada de oportunidades ni avisos comerciales
// automáticos, y ningún correo ni mensaje saliente. El aviso de ventana de «Pendiente de ti» es informativo de SU póliza
// (como el vencimiento del calendario); la petición es el botón.
import { diasEntre, type Fecha } from '@central/module-patrimonio'

/** Lista CERRADA de ofertas (un tipo por línea). Es un subconjunto de los tipos del puente (`pedir-precio-puente.ts`). */
export const TIPOS_OFERTA = [
  'comparar_externa',
  'impago_alquiler',
  'hipoteca',
] as const
export type TipoOferta = (typeof TIPOS_OFERTA)[number]

export const esTipoOferta = (v: unknown): v is TipoOferta => typeof v === 'string' && (TIPOS_OFERTA as readonly string[]).includes(v)

/** Respuestas de «¿tiene hipoteca?». `null` = no lo ha dicho (que NO es «no tiene»). */
export const RESPUESTAS_HIPOTECA = ['si', 'no', 'no_se'] as const
export type RespuestaHipoteca = (typeof RESPUESTAS_HIPOTECA)[number]
export const esRespuestaHipoteca = (v: unknown): v is RespuestaHipoteca => typeof v === 'string' && (RESPUESTAS_HIPOTECA as readonly string[]).includes(v)

/** Desde cuántos días antes del vencimiento «Pendiente de ti» avisa de una póliza de otra correduría. */
export const DIAS_VENTANA_COMPARAR = 60

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Texto de la tarjeta de una póliza DECLARADA. Con vencimiento: «Vence el dd/mm. ¿Te la comparamos?». Sin vencimiento NO se
 * ofrece por fecha (no se inventa ninguna): queda el botón manual con un texto que no afirma nada.
 */
export function textoCompararExterna(vence: string | null): string {
  return vence !== null && FECHA.test(vence) ? `Vence el ${dm(vence)}. ¿Te la comparamos?` : '¿Quieres que te la comparemos?'
}

/** Días hasta el vencimiento (negativo = pasado), o `null` si no consta. */
export function diasHastaVencer(vence: string | null, hoy: string): number | null {
  if (vence === null || !FECHA.test(vence) || !FECHA.test(hoy)) return null
  return diasEntre(hoy as Fecha, vence as Fecha)
}

export type DeclaradaParaOferta = {
  id: string
  /** `YYYY-MM-DD` o `null` (no consta). */
  vence: string | null
  /** Lo que `declaradaVigente` dice: una ya no vigente no se ofrece. */
  vigente: boolean
  etiqueta: string
}

export type ItemComparar = { id: string; titulo: string; detalle: string; href: string }

/**
 * «Pendiente de ti»: las pólizas declaradas que vencen en ≤ 60 días (ni pasadas ni sin fecha). Sin vencimiento no entran
 * (no se avisa «por fecha» de lo que no tiene), y una no vigente tampoco. Ordenadas por la más cercana.
 */
export function itemsCompararPendientes(declaradas: readonly DeclaradaParaOferta[], hoy: string): ItemComparar[] {
  return declaradas
    .flatMap((d) => {
      const dias = d.vigente ? diasHastaVencer(d.vence, hoy) : null
      return dias !== null && dias >= 0 && dias <= DIAS_VENTANA_COMPARAR && d.vence !== null ? [{ d, dias, vence: d.vence }] : []
    })
    .sort((a, b) => a.dias - b.dias)
    .map(({ d, vence }) => ({
      id: d.id,
      titulo: `Tu póliza ${d.etiqueta} vence el ${dm(vence)}`,
      detalle: '¿Te la comparamos? Lo decides tú, en su ficha.',
      href: `/boveda/anadida/${d.id}`,
    }))
}

/** Título de la tarjeta de impago: con la renta del contrato, o sin cifra si no consta (nunca 0). */
export function tituloProtegeRenta(rentaEur: string | null): string {
  return rentaEur === null ? 'Protege la renta' : `Protege la renta (${rentaEur}/mes)`
}

export const TEXTO_PROTEGE_RENTA =
  'Un seguro de impago de alquiler y defensa jurídica del arrendador cubre la renta si tu inquilino deja de pagar y los gastos de reclamarla.'

export const TEXTO_HIPOTECA = 'Los seguros de hogar y vida del banco suelen poder mejorarse.'

/** Mensajes de error de las ofertas (código del servidor → texto). Nunca «enviado» ante un fallo. */
export const ERRORES_OFERTA: Record<string, string> = {
  no_encontrado: 'Esto ya no está disponible. Recarga la página.',
  no_aplica: 'Ahora mismo no podemos ofrecértelo. Recarga la página.',
  datos_invalidos: 'No se ha podido enviar. Recarga la página.',
  sin_puente: 'Ahora mismo no podemos enviar la petición. Vuelve a intentarlo más tarde.',
  puente_fallido: 'No hemos podido enviar la petición. Inténtalo de nuevo en un rato.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Prueba más tarde.',
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  modo_corredor: 'En la vista de corredor no se puede cambiar nada.',
}
