/**
 * Enganche fase 1 → fase 2 (03/11/2026): cuando el agente de correo CREA la tarea de regularización de RC de Occident,
 * se abre la petición de regularización (borrador + Telegram a Alberto; nada sale al cliente sin su ✅).
 * Misma app: se llama a `crearRegularizacion` directamente (sin HTTP). Idempotente (póliza + periodo) y a prueba de
 * fallos: NUNCA lanza, para no romper el registro del evento de correo. `crear` se inyecta (tests sin BD).
 */
import { peticionRegularizacionDesdeEvento } from '@central/module-seguros/regularizacion-rc'

export type CrearRegularizacion = (
  correduriaId: string,
  e: { polizaId: string; periodoDesde: string; periodoHasta: string; compania: string; actor: string },
) => Promise<{ estado: string }>

export type ResultadoEnganche = { estado: string } | null

export async function engancharRegularizacion(
  crear: CrearRegularizacion,
  correduriaId: string,
  compania: string | null | undefined,
  item: Record<string, unknown>,
  polizaId: string,
  actor: string,
): Promise<ResultadoEnganche> {
  try {
    const peticion = peticionRegularizacionDesdeEvento({
      compania, tipo: item.tipo as string | undefined, subtipo: item.subtipo as string | null | undefined,
      numeroPoliza: item.numeroPoliza as string | null | undefined, periodoDesde: item.periodoDesde as string | null | undefined,
      periodoHasta: item.periodoHasta as string | null | undefined, periodo: item.periodo as string | null | undefined,
    })
    if (!peticion) return null
    const r = await crear(correduriaId, { polizaId, periodoDesde: peticion.periodoDesde, periodoHasta: peticion.periodoHasta, compania: peticion.compania, actor })
    if (r.estado !== 'creada' && r.estado !== 'ya_existe') console.warn(`[correo-evento] regularización RC no abierta: ${r.estado}`)
    return r
  } catch (e) {
    console.error('[correo-evento] enganche regularización RC falló (el evento sigue registrado):', e instanceof Error ? e.message.slice(0, 200) : 'error')
    return { estado: 'error' }
  }
}
