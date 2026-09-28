// Detalle del siniestro que manda la COMPAÑÍA por CIMA (desde el 28/09/2026):
// lector defensivo de lo que sirve el puerto de asegura (`detalleCima` de cada
// siniestro) y las reglas de pantalla, PURAS — las importa `Siniestros.tsx`
// (client component) y las prueba `siniestro-detalle-cima.test.ts`.
//
//   · `detalleCima: null` = CIMA no manda nada de esto, o asegura es anterior y
//     no lo sirve. Cada campo `null` = «no consta»: no se pinta, nunca 0/«sin X».
//   · 🚨 La PII (contacto, conductor, matrícula del contrario…) la descifra
//     asegura en su servidor. Si aun así llegara algo `v1:` (asegura sin clave,
//     o una versión que se lo salte), AQUÍ se tapa como `null`: un texto
//     cifrado nunca se pinta.
//   · Los códigos TIREA (convenio, clase/estado de expediente) viajan crudos y
//     se pintan como código: no hay tabla oficial y traducirlos a ojo sería
//     leer mal el dato.

import { DIAS_COMUNICACION_LCS } from '@central/module-seguros'

export type ExpedienteCima = {
  numero: string | null
  clase: string | null
  estado: string | null
  fechaInicio: string | null
  fechaFin: string | null
  importeReserva: number | null
  totalPagos: number | null
  totalRecobros: number | null
}

export type DetalleCima = {
  /** `YYYY-MM-DD`: cuándo se DECLARÓ a la compañía (≠ fecha del hecho). */
  fechaDeclaracion: string | null
  daa: boolean | null
  /** Cruda (CAUSANTE/PERJUDICADO…). Se lee con `textoResponsabilidad()`. */
  responsabilidad: string | null
  totalRecobros: number | null
  reservaDesglose: { descripcion: string | null; coberturas: { cobertura: string; importe: number | null }[] } | null
  convenios: string[] | null
  expedientes: ExpedienteCima[] | null
  riesgo: { descripcion: string | null; coberturas: { descripcion: string | null; capital: number | null }[] } | null
  contactoNombre: string | null
  contactoTelefono: string | null
  contactoObservaciones: string | null
  vehiculo: { matricula: string | null; marca: string | null; modelo: string | null; conductorNombre: string | null } | null
  vehiculoContrario: {
    matricula: string | null
    marcaModelo: string | null
    conductorNombre: string | null
    otros: { descripcion: string | null; valor: string | null }[]
  } | null
  asistencias: { descripcion: string | null; prestador: string | null }[] | null
  refMediador: string | null
  descripcion: string | null
}

/** Texto para pantalla, o `null`. Un valor cifrado (`v1:`) cuenta como `null`: jamás se pinta. */
export function textoSeguro(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' || t.startsWith('v1:') ? null : t
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const fecha = (v: unknown): string | null => {
  const t = textoSeguro(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const objetos = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []
const noVacia = <T>(xs: T[]): T[] | null => (xs.length > 0 ? xs : null)
const todoNull = (o: Record<string, unknown>) => Object.values(o).every((x) => x === null)

/** `detalleCima` del puerto → `DetalleCima`, o `null` si no llega, no tiene forma o viene vacío. */
export function leerDetalleCima(v: unknown): DetalleCima | null {
  const o = obj(v)
  if (!o) return null

  const rd = obj(o.reservaDesglose)
  const rdCob = rd
    ? objetos(rd.coberturas)
        .map((c) => ({ cobertura: textoSeguro(c.cobertura), importe: num(c.importe) }))
        .filter((c): c is { cobertura: string; importe: number | null } => c.cobertura !== null)
    : []
  const reservaDesglose = rd && (textoSeguro(rd.descripcion) !== null || rdCob.length > 0)
    ? { descripcion: textoSeguro(rd.descripcion), coberturas: rdCob }
    : null

  const ri = obj(o.riesgo)
  const riCob = ri
    ? objetos(ri.coberturas)
        .map((c) => ({ descripcion: textoSeguro(c.descripcion), capital: num(c.capital) }))
        .filter((c) => c.descripcion !== null || c.capital !== null)
    : []
  const riesgo = ri && (textoSeguro(ri.descripcion) !== null || riCob.length > 0)
    ? { descripcion: textoSeguro(ri.descripcion), coberturas: riCob }
    : null

  const ve = obj(o.vehiculo)
  const vehiculoC = ve
    ? { matricula: textoSeguro(ve.matricula), marca: textoSeguro(ve.marca), modelo: textoSeguro(ve.modelo), conductorNombre: textoSeguro(ve.conductorNombre) }
    : null
  const vehiculo = vehiculoC && !todoNull(vehiculoC) ? vehiculoC : null

  const vc = obj(o.vehiculoContrario)
  const otros = vc
    ? objetos(vc.otros)
        .map((d) => ({ descripcion: textoSeguro(d.descripcion), valor: textoSeguro(d.valor) }))
        .filter((d) => d.valor !== null)
    : []
  const vcC = vc
    ? { matricula: textoSeguro(vc.matricula), marcaModelo: textoSeguro(vc.marcaModelo), conductorNombre: textoSeguro(vc.conductorNombre) }
    : null
  const vehiculoContrario = vcC && (!todoNull(vcC) || otros.length > 0) ? { ...vcC, otros } : null

  const d: DetalleCima = {
    fechaDeclaracion: fecha(o.fechaDeclaracion),
    daa: typeof o.daa === 'boolean' ? o.daa : null,
    responsabilidad: textoSeguro(o.responsabilidad),
    totalRecobros: num(o.totalRecobros),
    reservaDesglose,
    convenios: Array.isArray(o.convenios) ? noVacia(o.convenios.map(textoSeguro).filter((c): c is string => c !== null)) : null,
    expedientes: Array.isArray(o.expedientes)
      ? noVacia(objetos(o.expedientes).map((e) => ({
          numero: textoSeguro(e.numero),
          clase: textoSeguro(e.clase),
          estado: textoSeguro(e.estado),
          fechaInicio: fecha(e.fechaInicio),
          fechaFin: fecha(e.fechaFin),
          importeReserva: num(e.importeReserva),
          totalPagos: num(e.totalPagos),
          totalRecobros: num(e.totalRecobros),
        })))
      : null,
    riesgo,
    contactoNombre: textoSeguro(o.contactoNombre),
    contactoTelefono: textoSeguro(o.contactoTelefono),
    contactoObservaciones: textoSeguro(o.contactoObservaciones),
    vehiculo,
    vehiculoContrario,
    asistencias: Array.isArray(o.asistencias)
      ? noVacia(
          objetos(o.asistencias)
            .map((a) => ({ descripcion: textoSeguro(a.descripcion), prestador: textoSeguro(a.prestador) }))
            .filter((a) => a.descripcion !== null || a.prestador !== null),
        )
      : null,
    refMediador: textoSeguro(o.refMediador),
    descripcion: textoSeguro(o.descripcion),
  }
  return todoNull(d as unknown as Record<string, unknown>) ? null : d
}

// ─── Reglas de pantalla ──────────────────────────────────────────────────────

/**
 * Responsabilidad que declara la compañía, legible. Las dos que manda CIMA hoy
 * (CAUSANTE / PERJUDICADO) llevan explicación; cualquier otra se enseña tal
 * cual, marcada como código. `null` = no consta (no se pinta).
 */
export function textoResponsabilidad(r: string | null): string | null {
  if (r === null) return null
  switch (r.toUpperCase()) {
    case 'CAUSANTE': return 'Causante (el asegurado causó el daño)'
    case 'PERJUDICADO': return 'Perjudicado (el asegurado sufrió el daño)'
    default: return `código ${r}`
  }
}

/** DAA sí/no. `null` = CIMA no lo dice → no se pinta (nunca «no»). */
export function textoDaa(daa: boolean | null): string | null {
  if (daa === null) return null
  return daa ? 'Sí, hay parte amistoso (DAA)' : 'No'
}

/** Convenios de CIMA: códigos crudos unidos. `null` = no consta. */
export function textoConvenios(c: string[] | null): string | null {
  return c === null || c.length === 0 ? null : c.map((x) => `código ${x}`).join(' · ')
}

/**
 * Días entre el hecho y la declaración a la compañía, y si pasa del plazo del
 * art. 16 LCS (7 días). `null` si falta cualquiera de las dos fechas o no se
 * leen: sin dato NO hay aviso, ni verde ni rojo.
 */
export function declaracionTardia(
  fechaOcurrencia: string | null,
  fechaDeclaracion: string | null,
): { dias: number; tardia: boolean } | null {
  if (!fechaOcurrencia || !fechaDeclaracion) return null
  const a = Date.parse(fechaOcurrencia.slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(fechaDeclaracion.slice(0, 10) + 'T00:00:00Z')
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  const dias = Math.round((b - a) / 86_400_000)
  return { dias, tardia: dias > DIAS_COMUNICACION_LCS }
}

/** `href` de `tel:` con solo dígitos y `+`; `null` si no queda ningún dígito. */
export function hrefTelefono(t: string | null): string | null {
  if (t === null) return null
  const limpio = t.replace(/[^\d+]/g, '')
  return /\d/.test(limpio) ? `tel:${limpio}` : null
}

/** «SEAT IBIZA · 1234ABC», o `null` si no hay nada que decir del vehículo. */
export function textoVehiculo(v: DetalleCima['vehiculo']): string | null {
  if (!v) return null
  const marca = [v.marca, v.modelo].filter(Boolean).join(' ')
  const t = [marca || null, v.matricula].filter(Boolean).join(' · ')
  return t === '' ? null : t
}
