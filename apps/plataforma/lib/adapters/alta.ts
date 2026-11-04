// Alta de cliente desde el panel: del cuerpo HTTP al `NuevoCliente` del adaptador y de vuelta a la respuesta.
// PURO (sin Next ni BD) para poder probarlo. La respuesta con `pinTemporal` lleva `no-store`: el PIN se enseña UNA vez.
import type { AltaResultado, NuevoCliente } from './types'

const txt = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function nuevoClienteDesdeBody(body: Record<string, unknown>): NuevoCliente {
  const d = (body.direccion && typeof body.direccion === 'object' ? body.direccion : {}) as Record<string, unknown>
  return {
    nombre: body.nombre as string, email: body.email as string | undefined, password: body.password as string | undefined,
    ciudad: body.ciudad as string | undefined, responsableNombre: body.responsableNombre as string | undefined,
    color: body.color as string | undefined, logo: body.logo as string | undefined,
    nif: txt(body.nif),
    direccion: { cp: txt(d.cp), provincia: txt(d.provincia), municipio: txt(d.municipio), via: txt(d.via), numero: txt(d.numero) },
    // Solo el booleano `true` vincula: ni "true" ni 1 ni la ausencia.
    vincularExistente: body.vincularExistente === true,
  }
}

export function respuestaAlta(r: AltaResultado): { cuerpo: Record<string, unknown>; cabeceras: Record<string, string> } {
  return {
    cuerpo: { ok: true, id: r.id, ...(r.vinculado ? { vinculado: true } : {}), ...(r.pinTemporal ? { pinTemporal: r.pinTemporal } : {}) },
    cabeceras: r.pinTemporal ? { 'Cache-Control': 'no-store' } : {},
  }
}
