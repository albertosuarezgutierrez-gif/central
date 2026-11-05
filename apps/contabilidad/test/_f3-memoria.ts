// Fake en memoria de la parte F3 del repositorio (actividad, compras, banco). Imita las garantías de 0003 que importan a los casos de uso:
// UNIQUE (NIF, nº normalizado), UNIQUE (huella), UNIQUE por movimiento en conciliaciones y reglas que solo se desactivan.
import type { ProveedorRecordado } from '@central/module-contabilidad'
import type { RepoF3, FilaFacturaRecibida, MovimientoBancoLeido, ReglaConciliacionLeida } from '../lib/repo-f3.ts'
import type { FilaEmpresa } from '../lib/repo.ts'

export type DatosF3 = {
  cnae: string | null
  proveedores: ProveedorRecordado[]
  facturas: (FilaFacturaRecibida & { numeroNorm: string; hechoId: string })[]
  movimientos: (MovimientoBancoLeido & { huella: string; saldo: number | null })[]
  conciliaciones: { movimientoId: string; tipo: 'cobro' | 'pago' | 'regla'; documento: string | null; cuenta: string | null; metodo: 'importe_exacto' | 'regla' | 'manual'; hechoId: string; asientoId: string | null }[]
  reglas: (ReglaConciliacionLeida & { activa: boolean })[]
}
export const f3Vacio = (): DatosF3 => ({ cnae: null, proveedores: [], facturas: [], movimientos: [], conciliaciones: [], reglas: [] })

export function f3Memoria(d: { empresa: FilaEmpresa | null; f3: DatosF3 }, nuevoId: () => string): RepoF3 {
  const f = d.f3
  const conC = (m: DatosF3['movimientos'][number]): MovimientoBancoLeido => {
    const c = f.conciliaciones.find((x) => x.movimientoId === m.id)
    const { huella: _h, saldo: _s, ...resto } = m
    return { ...resto, conciliacion: c ? { tipo: c.tipo, documento: c.documento, cuenta: c.cuenta, metodo: c.metodo, asientoId: c.asientoId, confirmadaEn: '2026-01-01T00:00:00.000Z' } : null }
  }
  return {
    async cnaeEmpresa() { return f.cnae },
    async fijarActividad(cnae, sector) { f.cnae = cnae; if (sector && d.empresa) d.empresa = { ...d.empresa, sector } },
    async proveedor(nif) { return f.proveedores.find((p) => p.nif === nif) ?? null },
    async proveedoresRecientes(limite) { return f.proveedores.slice(-limite).reverse() },
    async guardarProveedor(p) { const i = f.proveedores.findIndex((x) => x.nif === p.nif); if (i >= 0) f.proveedores[i] = { ...p }; else f.proveedores.push({ ...p }) },
    async facturaRecibidaPorClave(nif, numeroNorm) { return f.facturas.find((x) => x.proveedorNif === nif && x.numeroNorm === numeroNorm) ?? null },
    async insertarFacturaRecibida(x) {
      if (f.facturas.some((y) => y.proveedorNif === x.proveedorNif && y.numeroNorm === x.numeroNorm)) return null
      const id = nuevoId()
      f.facturas.push({ id, proveedorNif: x.proveedorNif, proveedorNombre: x.proveedorNombre, numero: x.numero, numeroNorm: x.numeroNorm, fecha: x.fecha, fechaContable: x.fechaContable,
        base: x.base, cuota: x.cuota, retencion: x.retencion, total: x.total, origen: x.origen, adjuntoRef: x.adjuntoRef ?? null, asientoId: x.asientoId, hechoId: x.hechoId })
      return id
    },
    async facturasRecibidas({ limite }) { return f.facturas.slice(-limite).reverse() },
    async insertarMovimientosBanco(movs) {
      let nuevos = 0
      for (const m of movs) {
        if (f.movimientos.some((x) => x.huella === m.huella)) continue
        f.movimientos.push({ id: nuevoId(), cuentaRef: m.cuentaRef, fecha: m.fecha, fechaValor: m.fechaValor, importe: m.importe, concepto: m.concepto, contraparte: m.contraparte,
          referencia: m.referencia, origen: m.origen, conciliacion: null, huella: m.huella, saldo: m.saldo })
        nuevos += 1
      }
      return { nuevos, repetidos: movs.length - nuevos }
    },
    async movimientosBanco({ filtro, limite }) {
      return f.movimientos.map(conC).filter((m) => filtro === 'todos' || (filtro === 'pendientes') === (m.conciliacion === null)).slice(0, limite)
    },
    async movimientoBanco(id) { const m = f.movimientos.find((x) => x.id === id); return m ? conC(m) : null },
    async insertarConciliacion(c) {
      if (f.conciliaciones.some((x) => x.movimientoId === c.movimientoId)) return null
      f.conciliaciones.push({ movimientoId: c.movimientoId, tipo: c.tipo, documento: c.documento, cuenta: c.cuenta, metodo: c.metodo, hechoId: c.hechoId, asientoId: c.asientoId })
      return nuevoId()
    },
    async reglasConciliacion() { return f.reglas.filter((r) => r.activa).map(({ activa: _a, ...r }) => r) },
    async insertarReglaConciliacion(r) {
      if (f.reglas.some((x) => x.patron.toLowerCase() === r.patron.toLowerCase() && x.sentido === r.sentido)) return null
      const id = nuevoId()
      f.reglas.push({ id, patron: r.patron, cuenta: r.cuenta, sentido: r.sentido, creadaEn: '2026-01-01T00:00:00.000Z', activa: true })
      return id
    },
    async desactivarReglaConciliacion(id) { const r = f.reglas.find((x) => x.id === id && x.activa); if (!r) return false; r.activa = false; return true },
  }
}
