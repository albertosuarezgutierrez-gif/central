// lib/sivra/facturas/listas.ts — selección PURA de «solicitudes listas sin borrador» para /sivra/facturas.
// Lista = `pendiente`, datos que pasan `validarReceptor` y sin factura/borrador viva de su reserva. No emite ni envía.
import { entradaReceptor, faltasDe, TEXTO_FALTA } from './extraer.ts'
import { validarReceptor } from './receptor.ts'

export type SolicitudCruda = {
  id: string; reservationId: string; piso: string | null; estado: string
  receptorTipo: string | null; receptorNombre: string | null; receptorNif: string | null; receptorPais: string | null
  receptorEmail: string | null; receptorDireccion: unknown; receptorCc: string[] | null
  tieneFactura: boolean
}
export type SolicitudLista = { id: string; reservationId: string; piso: string; receptorNombre: string; receptorNif: string; email: string; cc: string[] }

export function solicitudesListas(filas: ReadonlyArray<SolicitudCruda>): SolicitudLista[] {
  const out: SolicitudLista[] = []
  for (const f of filas) {
    if (f.estado !== 'pendiente' || f.tieneFactura) continue
    const v = validarReceptor(entradaReceptor(f))
    if (!v.ok) continue
    out.push({
      id: f.id, reservationId: f.reservationId, piso: f.piso ?? '—', receptorNombre: v.receptor.nombre, receptorNif: v.receptor.nif,
      email: v.receptor.email, cc: (f.receptorCc ?? []).filter((e) => e !== v.receptor.email),
    })
  }
  return out
}

export type SolicitudIncompleta = { id: string; reservationId: string; piso: string; receptorNombre: string | null; email: string | null; token: string; faltan: string[] }
export type SolicitudCrudaToken = SolicitudCruda & { token: string }

/** Solicitudes `pendiente` SIN factura/borrador cuyos datos aún no pasan `validarReceptor`: qué falta + token del enlace al huésped. */
export function solicitudesIncompletas(filas: ReadonlyArray<SolicitudCrudaToken>): SolicitudIncompleta[] {
  const out: SolicitudIncompleta[] = []
  for (const f of filas) {
    if (f.estado !== 'pendiente' || f.tieneFactura) continue
    const v = validarReceptor(entradaReceptor(f))
    if (v.ok) continue
    out.push({
      id: f.id, reservationId: f.reservationId, piso: f.piso ?? '—', receptorNombre: f.receptorNombre?.trim() || null, email: f.receptorEmail?.trim() || null,
      token: f.token, faltan: faltasDe(v.errores).map((x) => TEXTO_FALTA[x]),
    })
  }
  return out
}
