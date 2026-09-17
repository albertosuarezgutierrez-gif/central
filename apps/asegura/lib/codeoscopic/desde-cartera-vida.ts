// Precalificación de VIDA sin póliza («oportunidad nueva»): la cartera viva
// tiene 0 pólizas de este ramo (03/09/2026), así que «nueva» es el ÚNICO caso.
// Mismo patrón que `precalificarMotoNueva`/`precalificarAutoNueva` de
// `desde-cartera.ts`, en fichero aparte por el mismo motivo que hogar: el
// riesgo de vida no comparte forma con el de un vehículo o una vivienda.
//
// 🚧 Ver la cabecera de `peticion-vida.ts`: el `risk` que se manda al vendor es
// una suposición razonada, no un contrato verificado.

import { revisarDatosVida, type DatosVida, type ReparoVida } from './peticion-vida.ts'
import { partirApellidos, sexoDeSaludo, diaSiguiente, type ClienteCartera } from './desde-cartera.ts'

function limpio(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim()
  return t === '' ? null : t
}

/** «Lead» y variantes son un centinela del CRM, no un nombre de pila. */
function nombreUtil(v: string | null): string | null {
  const l = limpio(v)
  if (l === null) return null
  return /^lead$/i.test(l) ? null : l
}

export type SupuestoVida = { campo: keyof DatosVida; valor: unknown; porque: string; optimista?: boolean }

export type PrecalificacionVida = {
  datos: Partial<DatosVida>
  supuestos: SupuestoVida[]
  faltan: ReparoVida[]
}

export type ResueltosVidaNueva = {
  estadoCivilId: string | null
  /**
   * 🚨 El capital NUNCA se supone: es la decisión de negocio que el corredor
   * teclea con el cliente delante, igual que la matrícula en auto/moto. Un
   * capital inventado sería una cifra falsa presentada como precio real.
   */
  capital: number | null
  duracionAnios: number | null
}

export function precalificarVidaNueva(
  cliente: ClienteCartera,
  resueltos: ResueltosVidaNueva,
  hoy: string,
): PrecalificacionVida {
  const supuestos: SupuestoVida[] = []
  const suponer = (campo: keyof DatosVida, valor: unknown, porque: string, optimista = false) => {
    supuestos.push({ campo, valor, porque, optimista })
    return valor
  }

  const { primero, segundo } = partirApellidos(cliente.apellidos)

  const fechaEfecto = suponer(
    'fechaEfecto',
    diaSiguiente(hoy),
    'no hay ninguna póliza que retarificar, así que se pide precio para mañana',
  ) as string

  const datos: Partial<DatosVida> = {
    dni: limpio(cliente.dni) ?? undefined,
    nombre: nombreUtil(cliente.nombre) ?? undefined,
    apellido1: primero ?? undefined,
    apellido2: segundo,
    fechaNacimiento: limpio(cliente.fechaNacimiento) ?? undefined,
    sexo: sexoDeSaludo(cliente.saludo) ?? undefined,
    estadoCivil: limpio(resueltos.estadoCivilId) ?? undefined,
    telefono: limpio(cliente.telefono)?.replace(/\s/g, '') ?? undefined,
    capital: resueltos.capital ?? undefined,
    duracionAnios: resueltos.duracionAnios ?? undefined,
    fechaEfecto,
  }

  return { datos, supuestos, faltan: revisarDatosVida(datos) }
}
