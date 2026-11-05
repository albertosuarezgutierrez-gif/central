// Datos de la pantalla Ajustes → Reglas de asiento: filas con valor efectivo, valor por defecto (sin reglas de la empresa) y procedencia. PURO.
import {
  etiquetaCategoria, ETIQUETA_MEDIO, MEDIOS_PAGO, plantillaDe, procedenciaRegla, reglasEfectivasDeSector, separarCategorias, TIPOS_REGLA,
  CAMPOS_REGLA, PREFIJO_CATEGORIA, PREFIJO_MEDIO, type ProcedenciaRegla, type ReglasEmpresa, type TipoRegla,
} from '@central/module-contabilidad'

export const TITULO_TIPO: Record<TipoRegla, string> = {
  venta: 'Facturas emitidas (ventas)', compra: 'Facturas recibidas (compras)', cobro: 'Cobros', pago: 'Pagos', nomina: 'Nóminas',
}

const ETIQUETA_CAMPO: Record<string, string> = {
  cliente: 'Clientes', ingreso: 'Ingresos (por defecto)', ivaRepercutido: 'IVA repercutido', retencionSoportada: 'Retenciones que te practican',
  proveedor: 'Proveedores', gasto: 'Gasto (por defecto)', ivaSoportado: 'IVA soportado', retencionPracticada: 'Retenciones que practicas',
  tesoreria: 'Caja o banco (por defecto)', sueldos: 'Sueldos y salarios', ssEmpresa: 'Seguridad Social a cargo de la empresa',
  irpfPracticado: 'IRPF retenido', ssAcreedora: 'Seguridad Social acreedora', remuneracionesPendientes: 'Remuneraciones pendientes de pago',
}

export type FilaRegla = { clave: string; etiqueta: string; valor: string; base: string; propia: boolean; procedencia: ProcedenciaRegla }
export type BloqueRegla = { tipo: TipoRegla; titulo: string; filas: FilaRegla[]; admiteCategorias: boolean }

export function bloquesDeReglas(sector: unknown, empresa: ReglasEmpresa): BloqueRegla[] {
  const efectivas = reglasEfectivasDeSector(sector, empresa)
  const sinEmpresa = reglasEfectivasDeSector(sector, {})
  return TIPOS_REGLA.map((tipo): BloqueRegla => {
    const propias = separarCategorias(empresa[tipo])
    const fila = (clave: string, etiqueta: string, valor: string, base: string, propia: boolean): FilaRegla =>
      ({ clave, etiqueta, valor, base, propia, procedencia: procedenciaRegla(sector, empresa, tipo, clave) })
    const filas: FilaRegla[] = CAMPOS_REGLA[tipo].map((c) =>
      fila(c, ETIQUETA_CAMPO[c] ?? c, (efectivas[tipo] as Record<string, string>)[c], (sinEmpresa[tipo] as Record<string, string>)[c], c in propias.campos))
    if (tipo === 'venta' || tipo === 'compra') {
      const ef = efectivas.categorias?.[tipo] ?? {}
      const ba = sinEmpresa.categorias?.[tipo] ?? {}
      for (const [cat, cuenta] of Object.entries(ef)) filas.push(fila(`${PREFIJO_CATEGORIA}${cat}`, `Categoría: ${etiquetaCategoria(cat)}`, cuenta, ba[cat] ?? '', cat in propias.categorias))
    }
    if (tipo === 'cobro' || tipo === 'pago') {
      const ef = efectivas.medios?.[tipo] ?? {}
      const ba = sinEmpresa.medios?.[tipo] ?? {}
      for (const m of MEDIOS_PAGO) filas.push(fila(`${PREFIJO_MEDIO}${m}`, `${tipo === 'cobro' ? 'Cobro' : 'Pago'} por ${ETIQUETA_MEDIO[m].toLowerCase()}`, ef[m] ?? (efectivas[tipo] as Record<string, string>).tesoreria, ba[m] ?? (sinEmpresa[tipo] as Record<string, string>).tesoreria, m in propias.medios))
    }
    return { tipo, titulo: TITULO_TIPO[tipo], filas, admiteCategorias: tipo === 'venta' || tipo === 'compra' }
  })
}

export const nombrePlantilla = (sector: unknown): string => plantillaDe(sector).nombre
