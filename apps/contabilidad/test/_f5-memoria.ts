// Fake en memoria de `RepoF5` que imita 0005 sobre el almacén de `_repo-memoria.ts`: ficha inmutable salvo la baja (una vez), tabla y periodificaciones solo
// se añaden, cierre inmutable, y el trigger de ejercicios (cerrado definitivo; para cerrar: registro de cierre + cuentas 6/7 a cero).
import type { Asiento, FilaTablaAmortizacion, Periodificacion, SaldoCuenta } from '@central/module-contabilidad'
import type { BajaActivo, FilaActivo, FilaCierre, NuevoActivo, NuevoCierre, RepoF5 } from '../lib/repo-f5.ts'
import type { crearAlmacen } from './_repo-memoria.ts'

type DatosEmpresa = ReturnType<ReturnType<typeof crearAlmacen>['datos']>
type EstadoF5 = {
  activos: FilaActivo[]
  tablas: { version: number; filas: FilaTablaAmortizacion[] }[]
  periodificaciones: Periodificacion[]
  cierres: FilaCierre[]
}
const estados = new WeakMap<object, EstadoF5>()
let seq = 0

export function f5Memoria(d: DatosEmpresa): RepoF5 & { estado: EstadoF5 } {
  if (!estados.has(d)) estados.set(d, { activos: [], tablas: [], periodificaciones: [], cierres: [] })
  const st = estados.get(d)!
  const esCierre = (a: { origenTipo?: string; origenRef?: string; origen: string }) => a.origen === 'cierre' && (a.origenRef?.startsWith('regularizacion:') || a.origenRef?.startsWith('cierre:'))
  return {
    estado: st,
    async ejercicioBloqueado(anio) { const e = d.ejercicios.find((x) => x.anio === anio); return e ? { anio: e.anio, inicio: e.inicio, fin: e.fin, estado: e.estado } : null },
    async cerrarEjercicio(anio) {
      const e = d.ejercicios.find((x) => x.anio === anio)
      if (!e || e.estado !== 'abierto') return false
      if (!st.cierres.some((c) => c.anio === anio)) throw new Error('trigger: falta su registro de cierre')
      const por = new Map<string, number>()
      for (const a of d.asientos.filter((x) => x.ejercicio === anio)) for (const p of a.apuntes) if (p.cuenta[0] === '6' || p.cuenta[0] === '7') por.set(p.cuenta, (por.get(p.cuenta) ?? 0) + p.debe - p.haber)
      if ([...por.values()].some((v) => v !== 0)) throw new Error('trigger: las cuentas 6/7 no están a cero (falta regularizar)')
      e.estado = 'cerrado'
      return true
    },
    async saldosEjercicio(anio, { sinCierre }): Promise<SaldoCuenta[]> {
      const m = new Map<string, SaldoCuenta>()
      for (const a of d.asientos.filter((x) => x.ejercicio === anio && !(sinCierre && esCierre(x as never)))) {
        for (const p of a.apuntes) {
          const x = m.get(p.cuenta) ?? { cuenta: p.cuenta, debe: 0, haber: 0 }
          x.debe += p.debe; x.haber += p.haber
          m.set(p.cuenta, x)
        }
      }
      return [...m.values()].sort((a, b) => (a.cuenta < b.cuenta ? -1 : 1))
    },
    async asientosEjercicio(anio, limite) {
      const xs = d.asientos.filter((a) => a.ejercicio === anio).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero - b.numero))
      return {
        truncado: xs.length > limite,
        asientos: xs.slice(0, limite).map((a): Asiento => ({
          numero: a.numero, fecha: a.fecha, ejercicio: a.ejercicio, concepto: a.concepto,
          apuntes: a.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.debe, haber: p.haber, ...(p.documento ? { documento: p.documento } : {}) })),
          ...(a.origenTipo ? { origen: { tipo: a.origenTipo as never, ref: a.origenRef ?? '' } } : {}),
        })),
      }
    },
    async asientoPorOrigen(tipo, ref) {
      const a = d.asientos.find((x) => x.origenTipo === tipo && x.origenRef === ref)
      return a ? { id: a.id, numero: a.numero } : null
    },
    async cierre(anio) { return st.cierres.find((c) => c.anio === anio) ?? null },
    async cierres() { return st.cierres.map((c) => ({ ...c })) },
    async insertarCierre(c: NuevoCierre) {
      if (st.cierres.some((x) => x.anio === c.anio)) throw new Error('UNIQUE (empresa, anio)')
      st.cierres.push({ anio: c.anio, resultado: c.resultado, asientoRegularizacionId: c.asientoRegularizacionId, asientoCierreId: c.asientoCierreId, asientoAperturaId: c.asientoAperturaId, cerradoEn: 'x' })
    },
    async activos() { return st.activos.map((a) => ({ ...a })) },
    async activoPorRef(ref) { const a = st.activos.find((x) => x.ref === ref); return a ? { ...a } : null },
    async activoPorOrigen(origen, refExterna) { const a = st.activos.find((x) => x.origen === origen && x.refExterna === refExterna); return a ? { ...a } : null },
    async insertarActivo({ ficha, asientoAltaId }: NuevoActivo) {
      if (st.activos.some((x) => x.ref === ficha.ref || (x.origen === ficha.origen && x.refExterna === ficha.refExterna))) return null
      const id = `f5000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      st.activos.push({ ...ficha, id, estado: 'activo', fechaBaja: null, precioVenta: null, resultadoBaja: null, asientoAltaId, asientoBajaId: null })
      return id
    },
    async darDeBajaActivo(ref, b: BajaActivo) {
      const a = st.activos.find((x) => x.ref === ref)
      if (!a || a.estado === 'baja') return false
      Object.assign(a, { estado: 'baja', fechaBaja: b.fecha, precioVenta: b.precioVenta, resultadoBaja: b.resultado, asientoBajaId: b.asientoId })
      return true
    },
    async tablaAmortizacion() { const t = st.tablas[st.tablas.length - 1]; return t ? { version: t.version, filas: t.filas.map((f) => ({ ...f })) } : null },
    async guardarTablaAmortizacion(filas) { const version = st.tablas.length + 1; st.tablas.push({ version, filas: filas.map((f) => ({ ...f })) }); return version },
    async periodificaciones() { return st.periodificaciones.map((p) => ({ ...p })) },
    async insertarPeriodificacion(p) {
      if (st.periodificaciones.some((x) => x.ref === p.ref)) return false
      st.periodificaciones.push({ ...p })
      return true
    },
  }
}
