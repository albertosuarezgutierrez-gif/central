// Detalle del siniestro que manda la COMPAÑÍA por CIMA y la ingesta guarda
// desde el 28/09/2026 (repo `asegura`, PR #862, `columnasHuecos()` de
// `persist-siniestro.ts`). Columnas `*_cima` + `fecha_declaracion` de
// `seguros.siniestros`, SOLO rellenas en `origen='cima'`.
//
// Reglas (PURO: sin BD ni env; el descifrado entra inyectado):
//   · `null` = CIMA no lo manda. Nunca se convierte en `[]`, `0` ni `false`.
//   · PII cifrada en la ingesta con `encryptFieldNullable` (`v1:`…): contacto
//     (nombre, teléfono, observaciones), conductor propio, matrícula/conductor/
//     valores sueltos del contrario y el nombre de persona física de una
//     asistencia. Se descifra AQUÍ, en el servidor de asegura, y si no se puede
//     (clave ausente, texto corrupto) sale `null`: un `v1:` jamás viaja al
//     puerto — `decryptField` sin clave devuelve el texto TAL CUAL, así que no
//     basta con el `try`.
//   · Importes: la ingesta los guarda como decimal-string («400.00»); aquí a
//     número, y lo que no se lee → `null`.
//   · Códigos TIREA (convenio, clase/estado de expediente, responsabilidad)
//     viajan CRUDOS: no hay tabla oficial en el repo y traducirlos a ojo sería
//     un dato leído mal. La pantalla los pinta como código.

export type DetalleCimaSiniestro = {
  /** `YYYY-MM-DD`. Fecha en que se DECLARÓ a la compañía (≠ la del hecho). */
  fechaDeclaracion: string | null
  /** DAA (declaración amistosa de accidente). */
  daa: boolean | null
  /** `Asegurado/Responsabilidad` CRUDA (CAUSANTE/PERJUDICADO…). ≠ posición de culpa. */
  responsabilidad: string | null
  totalRecobros: number | null
  reservaDesglose: { descripcion: string | null; coberturas: { cobertura: string; importe: number | null }[] } | null
  /** Códigos de convenio CRUDOS (SC, AS…). */
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

/** Columnas de la fila que lee este módulo (añadidas a `SELECT_SINIESTRO`). */
export type FilaDetalleCima = {
  fechaDeclaracion: Date | null
  daaCima: boolean | null
  responsabilidadCima: string | null
  totalRecobrosCima: unknown
  reservaDesgloseCima: unknown
  conveniosCima: unknown
  expedientesCima: unknown
  riesgoCima: unknown
  contactoNombreCima: string | null
  contactoTelefonoCima: string | null
  vehiculoCima: unknown
  vehiculoContrarioCima: unknown
  asistenciasCima: unknown
  refMediadorCima: string | null
  descripcionCima: string | null
  contactoObservacionesCima: string | null
}

export const SELECT_DETALLE_CIMA = {
  fechaDeclaracion: true,
  daaCima: true,
  responsabilidadCima: true,
  totalRecobrosCima: true,
  reservaDesgloseCima: true,
  conveniosCima: true,
  expedientesCima: true,
  riesgoCima: true,
  contactoNombreCima: true,
  contactoTelefonoCima: true,
  vehiculoCima: true,
  vehiculoContrarioCima: true,
  asistenciasCima: true,
  refMediadorCima: true,
  descripcionCima: true,
  contactoObservacionesCima: true,
} as const

/** Descifra (`decryptField` de `@central/module-seguros-pii`, inyectado). Puede lanzar. */
export type Descifrar = (v: string) => string

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** ¿Tiene pinta de valor cifrado? Nunca debe salir del servidor. */
export function pareceCifrado(v: string): boolean {
  return v.startsWith('v1:')
}

/**
 * PII cifrada → claro, o `null`. `null` si no hay valor, si el descifrado lanza
 * y si lo que sale sigue siendo un `v1:` (sin clave `decryptField` devuelve el
 * texto tal cual). Un valor en claro heredado (sin `v1:`) pasa, como en el
 * resto de PII de asegura.
 */
export function descifrarSeguro(v: unknown, descifrar: Descifrar): string | null {
  const t = txt(v)
  if (t === null) return null
  let claro: string
  try {
    claro = descifrar(t)
  } catch {
    return null
  }
  const c = txt(claro)
  return c === null || pareceCifrado(c) ? null : c
}

/** Texto en claro que NO debería venir cifrado; si viene con `v1:`, se tapa igual. */
const claro = (v: unknown): string | null => {
  const t = txt(v)
  return t === null || pareceCifrado(t) ? null : t
}

/** Decimal-string / número → número finito, o `null` (nunca 0 por defecto). */
export function importeCima(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : null
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

const objetos = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => x !== null) : []

/** Lista no vacía o `null`: `[]` no se inventa (la ingesta nunca lo escribe). */
const noVacia = <T>(xs: T[]): T[] | null => (xs.length > 0 ? xs : null)

const fechaIso = (v: unknown): string | null => {
  const t = txt(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

function reservaDesgloseDe(v: unknown): DetalleCimaSiniestro['reservaDesglose'] {
  const o = obj(v)
  if (!o) return null
  const coberturas = objetos(o.coberturas)
    .map((c) => ({ cobertura: claro(c.cobertura), importe: importeCima(c.importe) }))
    .filter((c): c is { cobertura: string; importe: number | null } => c.cobertura !== null)
  const descripcion = claro(o.descripcion)
  if (descripcion === null && coberturas.length === 0) return null
  return { descripcion, coberturas }
}

function expedientesDe(v: unknown): ExpedienteCima[] | null {
  if (!Array.isArray(v)) return null
  return noVacia(
    objetos(v).map((e) => ({
      numero: claro(e.numero),
      clase: claro(e.clase),
      estado: claro(e.estado),
      fechaInicio: fechaIso(e.fechaInicio),
      fechaFin: fechaIso(e.fechaFin),
      importeReserva: importeCima(e.importeReserva),
      totalPagos: importeCima(e.totalPagos),
      totalRecobros: importeCima(e.totalRecobros),
    })),
  )
}

function riesgoDe(v: unknown): DetalleCimaSiniestro['riesgo'] {
  const o = obj(v)
  if (!o) return null
  const coberturas = objetos(o.coberturas)
    .map((c) => ({ descripcion: claro(c.descripcion), capital: importeCima(c.capital) }))
    .filter((c) => c.descripcion !== null || c.capital !== null)
  const descripcion = claro(o.descripcion)
  if (descripcion === null && coberturas.length === 0) return null
  return { descripcion, coberturas }
}

function vehiculoDe(v: unknown, descifrar: Descifrar): DetalleCimaSiniestro['vehiculo'] {
  const o = obj(v)
  if (!o) return null
  const r = {
    matricula: claro(o.matricula),
    marca: claro(o.marca),
    modelo: claro(o.modelo),
    conductorNombre: descifrarSeguro(o.conductorNombre, descifrar),
  }
  return Object.values(r).every((x) => x === null) ? null : r
}

function vehiculoContrarioDe(v: unknown, descifrar: Descifrar): DetalleCimaSiniestro['vehiculoContrario'] {
  const o = obj(v)
  if (!o) return null
  const otros = objetos(o.otros)
    .map((d) => ({ descripcion: claro(d.descripcion) ?? claro(d.idDato), valor: descifrarSeguro(d.valor, descifrar) }))
    .filter((d) => d.valor !== null)
  const r = {
    matricula: descifrarSeguro(o.matricula, descifrar),
    marcaModelo: claro(o.marcaModelo),
    conductorNombre: descifrarSeguro(o.conductorNombre, descifrar),
    otros,
  }
  return r.matricula === null && r.marcaModelo === null && r.conductorNombre === null && otros.length === 0 ? null : r
}

function asistenciasDe(v: unknown, descifrar: Descifrar): DetalleCimaSiniestro['asistencias'] {
  if (!Array.isArray(v)) return null
  return noVacia(
    objetos(v)
      .map((a) => ({
        descripcion: claro(a.descripcion),
        // Empresa en claro; persona física cifrada en la ingesta.
        prestador: claro(a.razonSocial) ?? descifrarSeguro(a.nombre, descifrar),
      }))
      .filter((a) => a.descripcion !== null || a.prestador !== null),
  )
}

/**
 * Fila → detalle, o `null` si CIMA no manda ninguno de estos datos (siempre en
 * los siniestros `gestionado_correduria` y en los de CIMA anteriores al 28/09).
 */
export function detalleCimaDeFila(s: FilaDetalleCima, descifrar: Descifrar): DetalleCimaSiniestro | null {
  const convenios = Array.isArray(s.conveniosCima)
    ? noVacia(s.conveniosCima.map(claro).filter((c): c is string => c !== null))
    : null
  const d: DetalleCimaSiniestro = {
    fechaDeclaracion: s.fechaDeclaracion instanceof Date && !Number.isNaN(s.fechaDeclaracion.getTime())
      ? s.fechaDeclaracion.toISOString().slice(0, 10)
      : null,
    daa: typeof s.daaCima === 'boolean' ? s.daaCima : null,
    responsabilidad: claro(s.responsabilidadCima),
    totalRecobros: importeCima(s.totalRecobrosCima),
    reservaDesglose: reservaDesgloseDe(s.reservaDesgloseCima),
    convenios,
    expedientes: expedientesDe(s.expedientesCima),
    riesgo: riesgoDe(s.riesgoCima),
    contactoNombre: descifrarSeguro(s.contactoNombreCima, descifrar),
    contactoTelefono: descifrarSeguro(s.contactoTelefonoCima, descifrar),
    contactoObservaciones: descifrarSeguro(s.contactoObservacionesCima, descifrar),
    vehiculo: vehiculoDe(s.vehiculoCima, descifrar),
    vehiculoContrario: vehiculoContrarioDe(s.vehiculoContrarioCima, descifrar),
    asistencias: asistenciasDe(s.asistenciasCima, descifrar),
    refMediador: claro(s.refMediadorCima),
    descripcion: claro(s.descripcionCima),
  }
  return Object.values(d).every((x) => x === null) ? null : d
}
