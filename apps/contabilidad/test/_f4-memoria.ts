// Fake en memoria de `RepoF4` que imita los triggers de 0004: transiciones permitidas, cálculo inmutable fuera de borrador, presentado definitivo,
// complementaria solo sobre una versión presentada y nada se borra.
import type { FilaDeclaracion, NuevaDeclaracion, RepoF4 } from '../lib/repo-f4.ts'
import type { FilaHechoFiscal } from '../lib/impuestos-datos.ts'

export type DeclaracionMem = FilaDeclaracion & { calculo: unknown }

export function f4Memoria(opts: { hechos?: FilaHechoFiscal[]; sumas?: { cuenta: string; debe: number; haber: number; n: number }[]; regimen?: string | null } = {}) {
  const filas: DeclaracionMem[] = []
  let seq = 0
  const repo: RepoF4 = {
    async hechosFiscales(desde, hasta) { return { filas: (opts.hechos ?? []).filter((h) => h.fecha >= desde && h.fecha <= hasta), truncado: false } },
    async sumasFiscalesDeHechos() { return opts.sumas ?? [] },
    async regimenIva() { return opts.regimen === undefined ? 'general' : opts.regimen },
    async declaraciones(anio) { return filas.filter((f) => f.anio === anio).map((f) => ({ ...f })) },
    async declaracion(id) { const f = filas.find((x) => x.id === id); return f ? { ...f } : null },
    async ultimaVersion(modelo, anio, periodo) {
      const xs = filas.filter((f) => f.modelo === modelo && f.anio === anio && f.periodo === periodo).sort((a, b) => b.version - a.version)
      return xs[0] ? { ...xs[0] } : null
    },
    async presentados303(anio) { return filas.filter((f) => f.modelo === '303' && f.estado === 'presentado' && (f.anio === anio || (f.anio === anio - 1 && f.periodo === '4T'))).map((f) => ({ ...f })) },
    async presentados130(anio) { return filas.filter((f) => f.modelo === '130' && f.anio === anio && f.estado === 'presentado').map((f) => ({ ...f })) },
    async insertarDeclaracion(d: NuevaDeclaracion) {
      if (filas.some((f) => f.modelo === d.modelo && f.anio === d.anio && f.periodo === d.periodo && f.version === d.version)) return null
      if (d.version > 1 && !filas.some((f) => f.modelo === d.modelo && f.anio === d.anio && f.periodo === d.periodo && f.version === d.version - 1 && f.estado === 'presentado')) {
        throw new Error('la complementaria exige la versión anterior presentada')
      }
      const id = `d0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      filas.push({ id, modelo: d.modelo, anio: d.anio, periodo: d.periodo, version: d.version, estado: 'borrador', resultado: d.resultado, completo: d.completo, calculadoEn: 'x', revisadoEn: null, presentadoEl: null, justificante: null, asientoLiquidacionId: null, asientoPagoId: null, calculo: d.calculo })
      return id
    },
    async actualizarBorrador(id, d) {
      const f = filas.find((x) => x.id === id)
      if (!f || f.estado !== 'borrador') return false
      Object.assign(f, { resultado: d.resultado, completo: d.completo, calculo: d.calculo })
      return true
    },
    async marcarRevisada(id) {
      const f = filas.find((x) => x.id === id)
      if (!f || f.estado !== 'borrador' || !f.completo) return false
      f.estado = 'revisado'; f.revisadoEn = 'ahora'
      return true
    },
    async devolverABorrador(id) {
      const f = filas.find((x) => x.id === id)
      if (!f || f.estado !== 'revisado') return false
      f.estado = 'borrador'; f.revisadoEn = null
      return true
    },
    async marcarPresentada(id, d) {
      const f = filas.find((x) => x.id === id)
      if (!f || f.estado !== 'revisado' || !f.completo) return false
      Object.assign(f, { estado: 'presentado', presentadoEl: d.fecha, justificante: d.justificante, asientoLiquidacionId: d.asientoLiquidacionId, asientoPagoId: d.asientoPagoId })
      return true
    },
  }
  return { repo, filas }
}
