/**
 * «La compañía tiene otro dato» (fase 2 del rediseño de la ficha, 24/09/2026).
 *
 * Regla de Alberto: los datos del cliente que tenemos NOSOTROS mandan sobre los de la compañía
 * (una póliza pudo emitirse con un móvil que no es el suyo). Y así funciona ya la ingesta: CIMA
 * nunca pisa el teléfono ni el correo de una ficha existente; lo que trae de la compañía queda en
 * los intervinientes de la póliza (`origen = 'cima'`). Este módulo compara esos datos con los
 * contactos de la ficha y devuelve los que la compañía tiene y nosotros no, para ofrecer
 * «añadir a sus contactos» — nunca para sustituir nada.
 *
 * Tres estados: `sin_comprobar` (falta una de las dos listas: no se afirma nada) · `ok` con
 * lista vacía (se ha mirado y coinciden) · `ok` con datos. `incompleta` = hay contactos cifrados
 * que no se han podido leer, así que un «distinto» puede ser uno de esos.
 */
import type { ContactosCliente } from './cliente-edicion-asegura'
import type { IntervinienteFicha } from './ficha-asegura'

export type DatoCompania = { tipo: 'telefono' | 'email'; valor: string; rol: string; polizaId: string }

export type DatosCompania =
  | { estado: 'sin_comprobar'; motivo: string }
  | { estado: 'ok'; nuevos: DatoCompania[]; ilegibles: number; incompleta: boolean }

/** Solo cifras, sin el prefijo de España: «+34 600 11 22 33» y «600112233» son el mismo. */
export function claveTelefono(v: string): string | null {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('0034')) d = d.slice(4)
  else if (d.length === 11 && d.startsWith('34')) d = d.slice(2)
  return d.length >= 6 ? d : null
}

export function claveEmail(v: string): string | null {
  const e = v.trim().toLowerCase()
  return e.includes('@') ? e : null
}

export function datosDeLaCompania(
  fichaId: string,
  intervinientes: IntervinienteFicha[] | null,
  contactos: ContactosCliente | null,
): DatosCompania {
  if (intervinientes === null) return { estado: 'sin_comprobar', motivo: 'no han llegado los intervinientes de sus pólizas' }
  if (contactos === null) return { estado: 'sin_comprobar', motivo: 'no se han podido leer sus contactos' }

  const nuestros = new Set<string>()
  let incompleta = false
  for (const c of [...contactos.telefonos, ...contactos.emails]) {
    if (c.ilegible || c.valor === null) { incompleta = true; continue }
    const k = c.tipo === 'telefono' ? claveTelefono(c.valor) : claveEmail(c.valor)
    if (k !== null) nuestros.add(`${c.tipo}:${k}`)
  }

  const vistos = new Set<string>()
  const nuevos: DatoCompania[] = []
  let ilegibles = 0
  for (const i of intervinientes) {
    // Solo lo que trae la compañía sobre ESTA persona: otra persona de la póliza tiene su propio teléfono.
    if (i.origen !== 'cima' || i.fichaId !== fichaId) continue
    if (i.telefonoIlegible) ilegibles++
    if (i.emailIlegible) ilegibles++
    const candidatos: [DatoCompania['tipo'], string | null, string | null][] = [
      ['telefono', i.telefono, i.telefono ? claveTelefono(i.telefono) : null],
      ['email', i.email, i.email ? claveEmail(i.email) : null],
    ]
    for (const [tipo, valor, k] of candidatos) {
      if (valor === null || k === null) continue
      const clave = `${tipo}:${k}`
      if (nuestros.has(clave) || vistos.has(clave)) continue
      vistos.add(clave)
      nuevos.push({ tipo, valor: valor.trim(), rol: i.rol, polizaId: i.polizaId })
    }
  }
  return { estado: 'ok', nuevos, ilegibles, incompleta }
}
