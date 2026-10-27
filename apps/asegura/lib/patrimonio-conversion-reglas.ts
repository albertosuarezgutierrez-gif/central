// Panel de conversión de Patrimonio (27/10/2026) — agregación PURA del puerto `GET /api/operador/patrimonio-conversion`.
// El contrato vive en la cabecera de `apps/plataforma/lib/correduria/patrimonio-conversion.ts` (NO se cambia desde aquí).
//
// Sin BD, sin red, sin reloj (`ahora` entra por parámetro). Las lecturas que pueden fallar de forma AISLADA (columnas cuyo SQL
// aún no está aplicado: `inmueble_padre_id`, `volcado`; o las pólizas/recibos) llegan envueltas en `Parte`: si `ok:false`, el
// campo sale `null` («no se sabe»), NUNCA 0 y sin tumbar el resto.
// Pólizas: se mandan CRUDAS (plataforma aplica `esCarteraEnVigor`, el contrato lo pide así). Sin PII: solo id, nombre visible y cifras.

export type Parte<T> = { ok: true; valor: T } | { ok: false }

export type FilaTitular = { titularId: string; clienteId: string; nombre: string | null; activoDesde: Date }
export type FilaInmuebles = { titularId: string; sueltos: number; unidades: number }
export type FilaLecturas = { titularId: string; total: number; mes: number }
export type FilaPoliza = {
  clienteId: string
  importRef: string | null
  eiacXmlHash: string | null
  estado: string | null
  sustituidaAt: Date | null
  mergedIntoPolizaId: string | null
  creadaEn: Date | null
}
export type FilaRecibo = { clienteId: string; fecha: Date | null; comisionBruta: string | null }

export type EntradaConversion = {
  titulares: readonly FilaTitular[]
  /** `conUnidades:false` = la columna `inmueble_padre_id` no existe aún: `sueltos` cuenta todas las filas y las unidades son «no se sabe». */
  inmuebles: Parte<{ filas: readonly FilaInmuebles[]; conUnidades: boolean }>
  facturas: readonly FilaLecturas[]
  /** `ok:false` = falta la columna `volcado`. */
  volcados: Parte<readonly FilaLecturas[]>
  polizas: Parte<readonly FilaPoliza[]>
  recibos: Parte<readonly FilaRecibo[]>
}

export type TitularPuerto = {
  titularId: string
  clienteId: string
  cliente: string
  activoDesde: string
  inmuebles: number | null
  unidades: number | null
  lecturas: { facturasTotal: number; facturasMes: number; volcadosTotal: number | null; volcadosMes: number | null }
  polizas: {
    importRef: string | null; eiacXmlHash: string | null; estado: string | null
    sustituidaAt: string | null; mergedIntoPolizaId: string | null; creadaEn: string | null
  }[] | null
  recibos: { fecha: string | null; comisionBruta: string | null }[] | null
}

const MS_DIA = 86_400_000
const iso = (d: Date | null): string | null => (d !== null && !Number.isNaN(d.getTime()) ? d.toISOString() : null)

/** `desdeMes` del contrato: ISO válido o `null` (el endpoint responde 422). */
export function leerDesdeMes(v: string | null): Date | null {
  if (v === null || v.trim() === '') return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t)
}

/** Inicio de la ventana de recibos que se manda: 12 meses atrás menos un día de holgura (plataforma aplica el corte exacto). */
export function desdeRecibos(ahora: Date): Date {
  const d = new Date(ahora)
  d.setUTCFullYear(d.getUTCFullYear() - 1)
  return new Date(d.getTime() - MS_DIA)
}

function agrupar<T extends { [k: string]: unknown }>(filas: readonly T[], clave: (f: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const f of filas) {
    const k = clave(f)
    const l = m.get(k)
    if (l) l.push(f)
    else m.set(k, [f])
  }
  return m
}

export function armarTitulares(e: EntradaConversion, ahora: Date): TitularPuerto[] {
  const inm = e.inmuebles.ok ? new Map(e.inmuebles.valor.filas.map((f) => [f.titularId, f])) : null
  const conUnidades = e.inmuebles.ok && e.inmuebles.valor.conUnidades
  const fac = new Map(e.facturas.map((f) => [f.titularId, f]))
  const vol = e.volcados.ok ? new Map(e.volcados.valor.map((f) => [f.titularId, f])) : null
  const pol = e.polizas.ok ? agrupar(e.polizas.valor, (p) => p.clienteId) : null
  const rec = e.recibos.ok ? agrupar(e.recibos.valor, (r) => r.clienteId) : null
  const desde = desdeRecibos(ahora).getTime()

  return e.titulares.map((t) => {
    const fi = inm?.get(t.titularId)
    const ff = fac.get(t.titularId)
    const fv = vol?.get(t.titularId)
    return {
      titularId: t.titularId,
      clienteId: t.clienteId,
      cliente: t.nombre !== null && t.nombre.trim() !== '' ? t.nombre.trim() : 'Cliente sin nombre',
      activoDesde: t.activoDesde.toISOString(),
      // Lectura fallida = null; lectura buena sin fila = 0 (revisado, no hay).
      inmuebles: inm === null ? null : (fi?.sueltos ?? 0),
      unidades: inm === null || !conUnidades ? null : (fi?.unidades ?? 0),
      lecturas: {
        facturasTotal: ff?.total ?? 0,
        facturasMes: ff?.mes ?? 0,
        volcadosTotal: vol === null ? null : (fv?.total ?? 0),
        volcadosMes: vol === null ? null : (fv?.mes ?? 0),
      },
      polizas: pol === null ? null : (pol.get(t.clienteId) ?? []).map((p) => ({
        importRef: p.importRef, eiacXmlHash: p.eiacXmlHash, estado: p.estado,
        sustituidaAt: iso(p.sustituidaAt), mergedIntoPolizaId: p.mergedIntoPolizaId, creadaEn: iso(p.creadaEn),
      })),
      // Sin fecha NO se descarta (plataforma la cuenta como ilegible); con fecha, solo la ventana de 12 meses.
      recibos: rec === null ? null : (rec.get(t.clienteId) ?? [])
        .filter((r) => r.fecha === null || Number.isNaN(r.fecha.getTime()) || r.fecha.getTime() >= desde)
        .map((r) => ({ fecha: iso(r.fecha), comisionBruta: r.comisionBruta })),
    }
  })
}
