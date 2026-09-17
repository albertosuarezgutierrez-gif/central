// Precalificación de SALUD sin póliza («oportunidad nueva»): la cartera viva
// tiene 0 pólizas de este ramo (03/09/2026). Mismo patrón que
// `desde-cartera-vida.ts` — ver su cabecera para el porqué del fichero aparte.
//
// 🚧 Ver la cabecera de `peticion-salud.ts`: el `risk` que se manda al vendor
// es una suposición razonada, no un contrato verificado.

import { revisarDatosSalud, type DatosSalud, type ReparoSalud } from './peticion-salud.ts'
import { partirApellidos, sexoDeSaludo, diaSiguiente, type ClienteCartera } from './desde-cartera.ts'

function limpio(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim()
  return t === '' ? null : t
}

function nombreUtil(v: string | null): string | null {
  const l = limpio(v)
  if (l === null) return null
  return /^lead$/i.test(l) ? null : l
}

export type SupuestoSalud = { campo: keyof DatosSalud; valor: unknown; porque: string; optimista?: boolean }

export type PrecalificacionSalud = {
  datos: Partial<DatosSalud>
  supuestos: SupuestoSalud[]
  faltan: ReparoSalud[]
}

export type ResueltosSaludNueva = {
  estadoCivilId: string | null
  /** 🚨 El capital NUNCA se supone: lo teclea el corredor. Ver `desde-cartera-vida.ts`. */
  capital: number | null
  modalidadDeseada: string | null
}

export function precalificarSaludNueva(
  cliente: ClienteCartera,
  resueltos: ResueltosSaludNueva,
  hoy: string,
): PrecalificacionSalud {
  const supuestos: SupuestoSalud[] = []
  const suponer = (campo: keyof DatosSalud, valor: unknown, porque: string, optimista = false) => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }

  const { primero, segundo } = partirApellidos(cliente.apellidos)

  const fechaEfecto = suponer(
    'fechaEfecto',
    diaSiguiente(hoy),
    'no hay ninguna póliza que retarificar, así que se pide precio para mañana',
  ) as string

  const datos: Partial<DatosSalud> = {
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    capital: resueltos.capital ?? undefined,
    modalidadDeseada: limpio(resueltos.modalidadDeseada),
    fechaEfecto,
  }

  return { datos, supuestos, faltan: revisarDatosSalud(datos) }
}
