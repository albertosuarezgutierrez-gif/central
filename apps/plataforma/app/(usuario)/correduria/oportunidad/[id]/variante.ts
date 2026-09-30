// Lo que las pantallas de pedir precio (auto-nuevo, moto-nuevo) necesitan saber del riesgo cuando
// cotizan una VARIANTE (29/09/2026, docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md).
// PURO y server-safe: se calcula en el `page.tsx` a partir de la lectura del riesgo y viaja como prop.

import type { RolFigura } from '@central/module-seguros'
import type { Riesgo } from '@/lib/riesgo-asegura'

/** Los papeles que NO son el tomador: los que una variante puede poner en otra ficha. */
export type RolExtra = 'propietario' | 'conductor_habitual' | 'conductor_ocasional'
export const ROLES_EXTRA: readonly RolExtra[] = ['propietario', 'conductor_habitual', 'conductor_ocasional']

export type VarianteNueva = {
  oportunidadId: string
  /** La variante que se abre (`?tarificacion=`); `null` = variante nueva. */
  tarificacionId: string | null
  /** «2121NST · Yamaha MT-07», lo que haya; `null` = el riesgo no lo trae. */
  etiqueta: string | null
  /** Solo los papeles que ocupa OTRA ficha distinta del tomador de esta pantalla. */
  figuras: Partial<Record<RolExtra, string>>
  nombres: Partial<Record<RolFigura, string>>
  /** Lo que falta en su ficha para cotizar. `null` = no se pudo leer (no «nada falta»). */
  faltan: Partial<Record<RolFigura, string[] | null>>
  /** Papeles que ocupa una EMPRESA (CIF): sin estado civil; solo puede ser propietaria. */
  empresas: Partial<Record<RolFigura, boolean>>
}

export function etiquetaRiesgo(r: Riesgo): string | null {
  const partes = [r.oportunidad.matricula, r.oportunidad.vehiculo].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (partes.length > 0) return partes.join(' · ')
  // Sin vehículo: lo que identifica el riesgo de otro ramo (la vivienda, lo que se asegura). Nunca un 0 ni un vacío.
  const d = r.datosRiesgo
  if (d?.clave === 'datosVivienda') {
    const via = [d.datos.nombreVia, d.datos.numeroVia].filter((x): x is string => typeof x === 'string' && x !== '').join(' ')
    return d.datos.direccion ?? (via !== '' ? via : null)
  }
  if (d?.clave === 'datosRiesgoLibre') return d.datos.descripcion ?? d.datos.direccion
  return null
}

/**
 * La variante para la pantalla de `tomadorId`. Una figura cuya ficha ES el tomador no viaja: el
 * servidor ya pone al tomador en todos los papeles vacíos.
 */
export function varianteDeRiesgo(r: Riesgo, tomadorId: string, tarificacionId: string | null): VarianteNueva {
  const figuras: VarianteNueva['figuras'] = {}
  const nombres: VarianteNueva['nombres'] = {}
  const faltan: VarianteNueva['faltan'] = {}
  const empresas: VarianteNueva['empresas'] = {}
  for (const f of r.figuras) {
    nombres[f.rol] = f.nombre
    faltan[f.rol] = f.faltan
    if (f.empresa) empresas[f.rol] = true
    if (f.rol !== 'tomador' && f.clienteId !== tomadorId && r.roles.includes(f.rol)) figuras[f.rol as RolExtra] = f.clienteId
  }
  return { oportunidadId: r.oportunidad.id, tarificacionId, etiqueta: etiquetaRiesgo(r), figuras, nombres, faltan, empresas }
}

/** El capital que el riesgo ya sabe (vida, salud, decesos). `null` = el riesgo no trae ese bloque; un campo sin dato, `null`. */
export function capitalDeRiesgo(r: Riesgo): { capital: number | null; duracionAnios: number | null; modalidadDeseada: string | null } | null {
  const d = r.datosRiesgo
  return d?.clave === 'datosCapital' ? { capital: d.datos.capital, duracionAnios: d.datos.duracionAnios, modalidadDeseada: d.datos.modalidadDeseada } : null
}

/** La vivienda que el riesgo ya sabe (hogar). `null` = el riesgo no trae ese bloque. */
export function viviendaDeRiesgo(r: Riesgo) {
  const d = r.datosRiesgo
  return d?.clave === 'datosVivienda' ? d.datos : null
}

/** El tomador vigente del riesgo: la figura `tomador` o, si no consta, el cliente de la oportunidad. */
export function tomadorDelRiesgo(r: Riesgo): string {
  return r.figuras.find((f) => f.rol === 'tomador')?.clienteId ?? r.oportunidad.clienteId
}

/** Los ramos que se pueden cotizar desde la pantalla del riesgo (`/cliente/{id}/{ramo}-nuevo?oportunidad=`). */
export type RamoVarianteNuevo = 'auto' | 'moto' | 'hogar' | 'vida' | 'salud' | 'decesos'
export const RAMOS_VARIANTE: readonly RamoVarianteNuevo[] = ['auto', 'moto', 'hogar', 'vida', 'salud', 'decesos']

/**
 * Los ramos que Codeoscopic tarifica y se cotizan desde la pantalla del riesgo (30/09/2026: antes solo auto y
 * moto; hogar, vida, salud y decesos tienen su `…-nuevo` y ahora también leen `?oportunidad=`). Responsabilidad
 * civil, comercio, comunidades y otros se cotizan fuera: `null`.
 */
export function ramoVariante(ramo: string): RamoVarianteNuevo | null {
  return (RAMOS_VARIANTE as readonly string[]).includes(ramo) ? (ramo as RamoVarianteNuevo) : null
}

/**
 * ¿Se puede REABRIR una variante ya pedida (`?tarificacion=`) sin pagar otra vez? Solo auto y moto retoman su
 * tarificación guardada; en hogar, vida, salud y decesos «Nueva variante» es siempre una cotización nueva.
 */
export function ramoRetomable(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto'
}

/**
 * ¿El enlace «completa tus datos» (solicitud-datos de asegura + formulario del portal) existe para este ramo?
 * Hoy SOLO moto y coche: sus campos (matrícula, garaje, carné…) y la página del portal son de vehículo, y asegura
 * responde 422 «solo moto y coche» para otro ramo. En hogar, vida, salud y decesos la ficha de la persona se
 * completa con «Editar datos» (`EditarFichaModal`), que sí vale para todo ramo.
 */
export function ramoConEnlaceDatos(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto'
}

/**
 * Retarificar la PÓLIZA dentro de su riesgo (`/poliza/{id}/retarificar?oportunidad=`): auto, moto y hogar
 * (29/09/2026). Distinto de `ramoVariante`: es la retarificación de una póliza que ya existe («con las mismas
 * personas»); vida, salud y decesos no tienen póliza en cartera que retarificar.
 */
export function retarificaEnRiesgo(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto' || ramo === 'hogar'
}

export function rutaVariante(ramo: RamoVarianteNuevo, tomadorId: string, oportunidadId: string, tarificacionId?: string | null): string {
  const q = new URLSearchParams({ oportunidad: oportunidadId })
  // `?tarificacion=` solo donde la pantalla sabe retomarla: en los demás ramos abriría un formulario en blanco
  // con un cartel de «abierta desde el historial».
  if (tarificacionId && ramoRetomable(ramo)) q.set('tarificacion', tarificacionId)
  return `/correduria/cliente/${encodeURIComponent(tomadorId)}/${ramo}-nuevo?${q.toString()}`
}

/** `searchParams` → un texto limpio o `null` (uuid u otro id opaco; nunca un array). */
export function paramTexto(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' && v.length <= 80 ? v.trim() : null
}
