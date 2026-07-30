// Lógica de flota/transporte. Funciones puras sobre los tipos genéricos (sin BD).
import type {
  AlertaDocumento,
  Carga,
  DocumentoVehiculo,
  EstadoDocumento,
  Intervalo,
  Mantenimiento,
  Porte,
  RentabilidadPorte,
  RentabilidadVehiculo,
  Repostaje,
  TipoDocumentoVehiculo,
  Vehiculo,
} from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ── Costes ────────────────────────────────────────────────────────────────────

function costeDesdeKm(km: number | null | undefined, v: Vehiculo): number {
  const tarifaKm = v.tarifaKm ?? 0
  const tarifaFija = v.tarifaFija ?? 0
  return round2((km ?? 0) * tarifaKm + tarifaFija)
}

/** Coste estimado del porte: el explícito si existe, si no km estimados × tarifa + fija. */
export function costePorteEstimado(porte: Porte, vehiculo: Vehiculo): number {
  if (porte.costeEstimado != null) return round2(porte.costeEstimado)
  return costeDesdeKm(porte.kmEstimados, vehiculo)
}

/** Coste real del porte: el explícito si existe, si no km reales × tarifa + fija. */
export function costePorteReal(porte: Porte, vehiculo: Vehiculo): number {
  if (porte.costeReal != null) return round2(porte.costeReal)
  return costeDesdeKm(porte.kmReales, vehiculo)
}

/** Coste real por km de un porte (0 si no hay km reales). */
export function costePorKm(porte: Porte, vehiculo: Vehiculo): number {
  const km = porte.kmReales ?? 0
  if (km <= 0) return 0
  return round2(costePorteReal(porte, vehiculo) / km)
}

/** Rentabilidad de un porte: estimado vs real, desviaciones y margen sobre lo facturado. */
export function rentabilidadPorte(porte: Porte, vehiculo: Vehiculo): RentabilidadPorte {
  const costeEstimado = costePorteEstimado(porte, vehiculo)
  const costeReal = costePorteReal(porte, vehiculo)
  const importeFacturado = round2(porte.importeFacturado ?? 0)
  const margen = round2(importeFacturado - costeReal)
  const margenPct = importeFacturado > 0 ? round2((margen / importeFacturado) * 100) : 0
  return {
    costeEstimado,
    costeReal,
    desviacionCoste: round2(costeReal - costeEstimado),
    desviacionKm: round2((porte.kmReales ?? 0) - (porte.kmEstimados ?? 0)),
    importeFacturado,
    margen,
    margenPct,
  }
}

/** Rentabilidad agregada de un vehículo en un periodo (ingresos vs combustible+mantenimiento). */
export function rentabilidadVehiculo(
  vehiculo: Vehiculo,
  portes: Porte[],
  mantenimientos: Mantenimiento[] = [],
  repostajes: Repostaje[] = [],
): RentabilidadVehiculo {
  const propios = portes.filter((p) => p.vehiculoId === vehiculo.id && p.estado !== 'cancelado')
  const kmTotales = round2(propios.reduce((s, p) => s + (p.kmReales ?? 0), 0))
  const ingresos = round2(propios.reduce((s, p) => s + (p.importeFacturado ?? 0), 0))
  const costeMant = mantenimientos
    .filter((m) => m.vehiculoId === vehiculo.id)
    .reduce((s, m) => s + m.coste, 0)
  const costeComb = repostajes
    .filter((r) => r.vehiculoId === vehiculo.id)
    .reduce((s, r) => s + r.importe, 0)
  const costeOperativo = round2(costeMant + costeComb)
  const margen = round2(ingresos - costeOperativo)
  const margenPct = ingresos > 0 ? round2((margen / ingresos) * 100) : 0
  return {
    vehiculoId: vehiculo.id,
    nPortes: propios.length,
    kmTotales,
    ingresos,
    costeOperativo,
    margen,
    margenPct,
    costePorKm: kmTotales > 0 ? round2(costeOperativo / kmTotales) : 0,
  }
}

// ── Asignación inteligente de vehículo ────────────────────────────────────────

/** ¿El vehículo cubre la carga? Capacidad (kg/m³) y tipo requerido (p. ej. frigorífico). */
export function vehiculoAptoParaCarga(vehiculo: Vehiculo, carga: Carga): boolean {
  if (!vehiculo.activo) return false
  if (carga.tipoRequerido && vehiculo.tipo !== carga.tipoRequerido) return false
  if (carga.pesoKg != null && vehiculo.capacidadKg != null && carga.pesoKg > vehiculo.capacidadKg) {
    return false
  }
  if (
    carga.volumenM3 != null &&
    vehiculo.capacidadM3 != null &&
    carga.volumenM3 > vehiculo.capacidadM3
  ) {
    return false
  }
  return true
}

function solapan(a: Intervalo, b: Intervalo): boolean {
  // Solape estricto: comparten algún instante (los extremos que solo se tocan NO solapan).
  return a.inicio < b.fin && b.inicio < a.fin
}

/** Intervalo de un porte a partir de salida/llegada (null si no tiene ambas). */
export function intervaloPorte(porte: Porte): Intervalo | null {
  if (!porte.horaSalida || !porte.horaLlegada) return null
  return { inicio: porte.horaSalida, fin: porte.horaLlegada }
}

/** ¿El vehículo está libre en el intervalo? (sin portes activos que solapen). */
export function vehiculoDisponible(
  vehiculoId: string,
  intervalo: Intervalo,
  portes: Porte[],
): boolean {
  return !portes.some((p) => {
    if (p.vehiculoId !== vehiculoId || p.estado === 'cancelado') return false
    const iv = intervaloPorte(p)
    return iv != null && solapan(iv, intervalo)
  })
}

/**
 * Vehículos aptos para una carga y (opcionalmente) libres en un intervalo, ordenados por el
 * "mejor ajuste": el de menor capacidad suficiente primero (no malgastar el camión grande).
 */
export function vehiculosAptos(
  vehiculos: Vehiculo[],
  carga: Carga,
  opts: { intervalo?: Intervalo; portes?: Porte[] } = {},
): Vehiculo[] {
  const { intervalo, portes = [] } = opts
  return vehiculos
    .filter((v) => vehiculoAptoParaCarga(v, carga))
    .filter((v) => (intervalo ? vehiculoDisponible(v.id, intervalo, portes) : true))
    .sort((a, b) => (a.capacidadKg ?? Infinity) - (b.capacidadKg ?? Infinity))
}

/** Asignación inteligente: el mejor vehículo apto y libre, o null si no hay. */
export function asignarVehiculo(
  vehiculos: Vehiculo[],
  carga: Carga,
  opts: { intervalo?: Intervalo; portes?: Porte[] } = {},
): Vehiculo | null {
  return vehiculosAptos(vehiculos, carga, opts)[0] ?? null
}

// ── Gestión documental (ITV, seguro, mantenimiento…) ──────────────────────────

const MS_DIA = 86_400_000

function diasEntre(desdeISO: string, hastaISO: string): number {
  const d = (Date.parse(hastaISO) - Date.parse(desdeISO)) / MS_DIA
  return Math.floor(d)
}

/**
 * Estado de un documento frente a una fecha de referencia (hoy):
 * caducado si ya pasó, por_caducar si quedan ≤ diasAviso, vigente en otro caso.
 */
export function estadoDocumento(
  doc: DocumentoVehiculo,
  hoyISO: string,
  diasAviso = 30,
): { estado: EstadoDocumento; diasParaCaducar: number } {
  const dias = diasEntre(hoyISO, doc.fechaCaducidad)
  let estado: EstadoDocumento
  if (dias < 0) estado = 'caducado'
  else if (dias <= diasAviso) estado = 'por_caducar'
  else estado = 'vigente'
  return { estado, diasParaCaducar: dias }
}

/** Alertas de documentos caducados o a punto de caducar (ordenadas por urgencia). */
export function alertasDocumentos(
  documentos: DocumentoVehiculo[],
  hoyISO: string,
  diasAviso = 30,
): AlertaDocumento[] {
  return documentos
    .map((doc) => {
      const { estado, diasParaCaducar } = estadoDocumento(doc, hoyISO, diasAviso)
      return {
        documentoId: doc.id,
        vehiculoId: doc.vehiculoId,
        tipo: doc.tipo,
        fechaCaducidad: doc.fechaCaducidad,
        estado,
        diasParaCaducar,
      }
    })
    .filter((a) => a.estado !== 'vigente')
    .sort((a, b) => a.diasParaCaducar - b.diasParaCaducar)
}

/** Documentos que la ley exige a un vehículo en circulación. */
export const DOCS_OBLIGATORIOS: TipoDocumentoVehiculo[] = ['itv', 'seguro']

/** Un vehículo al que le FALTA algún documento obligatorio en el sistema. */
export interface VehiculoSinDocumentar {
  vehiculoId: string
  matricula: string
  faltan: TipoDocumentoVehiculo[]
}

/**
 * Vehículos sin ITV o sin seguro REGISTRADOS.
 *
 * 🚨 `alertasDocumentos` solo puede avisar de lo que existe en la tabla: un
 * vehículo sin NINGUNA fila de documento no produce alerta, y el semáforo lo
 * daba por «todo en regla». Un camión con la ITV sin registrar es más peligroso
 * que uno con la ITV caducada —y era justo el que salía verde—, así que la
 * ausencia de dato tiene que verse como lo que es: un hueco, no un aprobado.
 */
export function vehiculosSinDocumentar(
  vehiculos: Vehiculo[],
  documentos: DocumentoVehiculo[],
  obligatorios: TipoDocumentoVehiculo[] = DOCS_OBLIGATORIOS,
): VehiculoSinDocumentar[] {
  const porVehiculo = new Map<string, Set<string>>()
  for (const d of documentos) {
    const set = porVehiculo.get(d.vehiculoId) ?? new Set<string>()
    set.add(d.tipo)
    porVehiculo.set(d.vehiculoId, set)
  }
  return vehiculos
    .map((v) => ({
      vehiculoId: v.id,
      matricula: v.matricula,
      faltan: obligatorios.filter((t) => !porVehiculo.get(v.id)?.has(t)),
    }))
    .filter((x) => x.faltan.length > 0)
}

// ── Intercompany (gancho del holding) ─────────────────────────────────────────

/** Un porte es intercompany si es interno y mueve entre dos sociedades distintas del grupo. */
export function esPorteIntercompany(porte: Porte): boolean {
  return Boolean(
    porte.esInterno &&
      porte.sociedadOrigenId &&
      porte.sociedadDestinoId &&
      porte.sociedadOrigenId !== porte.sociedadDestinoId,
  )
}

/** Total facturado en portes intercompany (lo que se elimina en el consolidado del holding). */
export function totalIntercompany(portes: Porte[]): number {
  return round2(
    portes
      .filter((p) => esPorteIntercompany(p) && p.estado !== 'cancelado')
      .reduce((s, p) => s + (p.importeFacturado ?? 0), 0),
  )
}
