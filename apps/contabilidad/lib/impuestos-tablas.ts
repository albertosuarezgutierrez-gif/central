// Libros registro de IVA y tablas auxiliares de los borradores como `Tabla` (el formato común de informes: CSV, Excel y HTML imprimible).
import { ETIQUETA_DESGLOSE, type CalculoModelo, type LibroRegistroIva, type TablaExtra } from '@central/module-contabilidad'
import type { ColumnaInforme } from './informes/catalogo.ts'
import type { FilaInforme, Tabla } from './informes/generar.ts'

const c = (clave: string, etiqueta: string, tipo: ColumnaInforme['tipo']): ColumnaInforme => ({ clave, etiqueta, tipo })

/** Libro registro: una fila por (factura, tipo de IVA), con el asiento de origen en la última columna. */
export function tablaLibroIva(l: LibroRegistroIva, titulo: string, refAAsiento: Readonly<Record<string, string>> = {}): Tabla {
  const emitidas = l.sentido === 'emitida'
  const filas: FilaInforme[] = l.lineas.map((x) => ({
    orden: x.orden, fecha: x.fecha, numero: x.numero, nif: x.nif ?? '', nombre: x.nombre, desglose: ETIQUETA_DESGLOSE[x.clave],
    base: x.base, tipo: x.tipoIva, cuota: x.cuota, total: x.total, nota: [x.noDeducible ? 'IVA no deducible' : '', x.rectificativa ? 'rectificativa' : ''].filter(Boolean).join(' · '),
    asiento: refAAsiento[x.ref] ?? x.ref,
  }))
  return {
    clave: emitidas ? 'libro_iva_emitidas' : 'libro_iva_recibidas',
    titulo, subtitulo: `${l.rango.desde} a ${l.rango.hasta} · borrador, sin validez ante la AEAT`,
    columnas: [c('orden', 'Nº orden', 'numero'), c('fecha', 'Fecha', 'fecha'), c('numero', 'Nº factura', 'texto'), c('nif', 'NIF', 'texto'), c('nombre', emitidas ? 'Cliente' : 'Proveedor', 'texto'),
      c('desglose', 'Desglose', 'texto'), c('base', 'Base', 'dinero'), c('tipo', 'Tipo %', 'numero'), c('cuota', 'Cuota', 'dinero'), c('total', 'Total', 'dinero'), c('nota', 'Nota', 'texto'), c('asiento', 'Asiento/origen', 'texto')],
    filas,
    totales: { orden: null, fecha: null, numero: 'Totales', nif: null, nombre: null, desglose: null, base: l.totales.base, tipo: null, cuota: l.totales.cuota, total: l.totales.total, nota: null, asiento: null },
    avisos: [...l.avisos, ...l.excluidas.map((e) => `${e.ref}: ${e.motivo}`)],
  }
}

/** Resumen por tipo: 21/10/4/0, exentas, inversión del sujeto pasivo, intracomunitarias, importaciones… */
export function tablaResumenLibroIva(l: LibroRegistroIva, titulo: string): Tabla {
  return {
    clave: l.sentido === 'emitida' ? 'resumen_iva_emitidas' : 'resumen_iva_recibidas',
    titulo, subtitulo: `${l.rango.desde} a ${l.rango.hasta} · borrador, sin validez ante la AEAT`,
    columnas: [c('desglose', 'Desglose', 'texto'), c('lineas', 'Líneas', 'numero'), c('base', 'Base', 'dinero'), c('cuota', 'Cuota', 'dinero'), c('total', 'Total', 'dinero')],
    filas: l.resumen.map((r) => ({ desglose: r.etiqueta, lineas: r.lineas, base: r.base, cuota: r.cuota, total: r.total })),
    totales: { desglose: 'Totales', lineas: l.lineas.length, base: l.totales.base, cuota: l.totales.cuota, total: l.totales.total },
    avisos: l.avisos,
  }
}

const eur = (n: number) => `${n < 0 ? '-' : ''}${Math.floor(Math.abs(n) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${String(Math.abs(n) % 100).padStart(2, '0')}€`

/** Tablas extra del borrador HTML según el modelo (terceros del 347, operadores del 349, perceptores del 190, arrendadores del 180). */
export function extrasDeSnapshot(s: CalculoModelo & Record<string, unknown>): TablaExtra[] {
  const arr = (k: string) => (Array.isArray(s[k]) ? (s[k] as Record<string, unknown>[]) : [])
  const t = (v: unknown) => String(v ?? '')
  switch (s.modelo) {
    case '347': return [{ titulo: 'Terceros declarados (importes con IVA)', columnas: ['Clave', 'NIF', 'Nombre', 'T1', 'T2', 'T3', 'T4', 'Total'],
      filas: arr('declarados').map((d) => [t(d.clave), t(d.nif), t(d.nombre), ...(d.trimestres as number[]).map(eur), eur(d.total as number)]) }]
    case '349': return [{ titulo: 'Operadores intracomunitarios', columnas: ['Clave', 'NIF-IVA', 'Nombre', 'Base'], filas: arr('operadores').map((o) => [t(o.clave), t(o.nifIva), t(o.nombre), eur(o.base as number)]) }]
    case '190': return [{ titulo: 'Perceptores', columnas: ['NIF', 'Nombre', 'Clave', 'Percepción dineraria', 'Retención', 'Percepción especie', 'Ingreso a cuenta'],
      filas: arr('perceptores').map((p) => [t(p.nif), t(p.nombre), t(p.clave), eur(p.percepcionDineraria as number), eur(p.retencionDineraria as number), eur(p.percepcionEspecie as number), eur(p.ingresoACuentaEspecie as number)]) }]
    case '180': return [{ titulo: 'Arrendadores', columnas: ['NIF', 'Nombre', 'Ref. catastral', 'Base', 'Retención'], filas: arr('arrendadores').map((a) => [t(a.nif), t(a.nombre), t(a.refCatastral), eur(a.base as number), eur(a.retencion as number)]) }]
    default: return []
  }
}
