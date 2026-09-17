// Precalificación de DECESOS sin póliza («oportunidad nueva»): la cartera
// viva tiene 0 pólizas de este ramo (03/09/2026). Mismo patrón que
// `desde-cartera-vida.ts` — ver su cabecera para el porqué del fichero aparte.
//
// 🚧 Ver la cabecera de `peticion-decesos.ts`: el `risk` que se manda al
// vendor es una suposición razonada (solo cubre al tomador), no un contrato
// verificado ni cobertura familiar.

import { revisarDatosDecesos, type DatosDecesos, type ReparoDecesos } from './peticion-decesos.ts'
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

export type SupuestoDecesos = { campo: keyof DatosDecesos; valor: unknown; porque: string; optimista?: boolean }

export type PrecalificacionDecesos = {
  datos: Partial<DatosDecesos>
  supuestos: SupuestoDecesos[]
  faltan: ReparoDecesos[]
}

export type ResueltosDecesosNueva = {
  estadoCivilId: string | null
  /** 🚨 El capital NUNCA se supone: lo teclea el corredor. Ver `desde-cartera-vida.ts`. */
  capital: number | null
}

export function precalificarDecesosNueva(
  cliente: ClienteCartera,
  resueltos: ResueltosDecesosNueva,
  hoy: string,
): PrecalificacionDecesos {
  const supuestos: SupuestoDecesos[] = []
  const suponer = (campo: keyof DatosDecesos, valor: unknown, porque: string, optimista = false) => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }

  const { primero, segundo } = partirApellidos(cliente.apellidos)

  const fechaEfecto = suponer(
    'fechaEfecto',
    diaSiguiente(hoy),
    'no hay ninguna póliza que retarificar, así que se pide precio para mañana',
  ) as string

  const datos: Partial<DatosDecesos> = {
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    capital: resueltos.capital ?? undefined,
    fechaEfecto,
  }

  return { datos, supuestos, faltan: revisarDatosDecesos(datos) }
}
