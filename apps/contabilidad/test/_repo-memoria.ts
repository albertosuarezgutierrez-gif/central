// Fake en memoria de `RepoContable` para probar los casos de uso sin BD. Imita las garantías de 0001 que importan aquí:
// datos separados por empresa, clave única de hechos (ON CONFLICT DO NOTHING → null), número correlativo por ejercicio y
// solo-añadir (no expone ningún UPDATE/DELETE de asientos; los guarda congelados).
import { aFechaISO, sumasMensualesDeAsientos, type Aviso } from '@central/module-contabilidad'
import type {
  RepoContable, AvisoLeido, FilaCuenta, FilaEjercicio, AsientoLeido, FilaHecho, NuevoAsiento, NuevoHecho, EntradaAuditoria, SumaCuenta, FilaEmpresa,
} from '../lib/repo.ts'
import type { TipoHecho } from '../lib/hecho-entrada.ts'
import { filasSemillaPgc } from '../lib/alta-empresa.ts'
import { f3Memoria, f3Vacio, type DatosF3 } from './_f3-memoria.ts'

type Datos = {
  empresa: FilaEmpresa | null
  plan: FilaCuenta[]
  ejercicios: (FilaEjercicio & { ultimo: number })[]
  asientos: (AsientoLeido & { hash: string; hechoId?: string; origenTipo?: string; origenRef?: string })[]
  hechos: (FilaHecho & { app: string; tipo: TipoHecho; ref: string })[]
  reglas: { tipo: TipoHecho; cuentas: Record<string, string>; version: number }[]
  origenes: Set<string>
  vinculos: { usuarioId: string; rol: 'dueno' | 'gestor'; activo: boolean }[]
  auditoria: EntradaAuditoria[]
  avisos: (AvisoLeido & { leidoPor?: string | null })[]
  f3: DatosF3
}

export function crearAlmacen() {
  const porEmpresa = new Map<string, Datos>()
  let seq = 0
  const nuevoId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const datos = (e: string): Datos => {
    if (!porEmpresa.has(e)) {
      porEmpresa.set(e, { empresa: null, plan: [], ejercicios: [], asientos: [], hechos: [], reglas: [], origenes: new Set(), vinculos: [], auditoria: [], avisos: [], f3: f3Vacio() })
    }
    return porEmpresa.get(e)!
  }

  function repo(empresaId: string): RepoContable {
    const d = datos(empresaId)
    return {
      ...f3Memoria(d, nuevoId),
      empresaId,
      async empresa() { return d.empresa },
      async planCuentas() { return d.plan.map((c) => ({ ...c })) },
      async ejercicio(anio) { const e = d.ejercicios.find((x) => x.anio === anio); return e ? { anio: e.anio, inicio: e.inicio, fin: e.fin, estado: e.estado } : null },
      async ejercicios() { return d.ejercicios.map(({ ultimo: _u, ...e }) => e) },
      async reservarNumero(anio) {
        const e = d.ejercicios.find((x) => x.anio === anio)
        if (!e) throw new Error(`no existe el ejercicio ${anio}`)
        e.ultimo += 1
        return e.ultimo
      },
      async insertarAsiento(a: NuevoAsiento) {
        if (d.asientos.some((x) => x.ejercicio === a.ejercicio && x.numero === a.numero)) throw new Error('número de asiento duplicado')
        if (a.reversaDe && d.asientos.some((x) => x.reversaDe === a.reversaDe)) throw new Error('ya rectificado (unique)')
        // 0001: trigger «ejercicio abierto». 0005: trigger de unicidad (salvo rectificados) de los asientos de amortización/periodificación/cierre/apertura.
        const ej = d.ejercicios.find((x) => x.anio === a.ejercicio)
        if (!ej) throw new Error(`no existe el ejercicio ${a.ejercicio}`)
        if (ej.estado !== 'abierto') throw new Error(`trigger: el ejercicio ${a.ejercicio} está ${ej.estado}: no admite asientos`)
        if (a.origenTipo && ['amortizacion', 'periodificacion', 'cierre', 'apertura'].includes(a.origenTipo) && d.asientos.some((x) => x.origenTipo === a.origenTipo && x.origenRef === a.origenRef && !d.asientos.some((r) => r.reversaDe === x.id))) {
          throw new Error('uq_asientos_origen_f5: ya existe un asiento con ese origen')
        }
        const debe = a.apuntes.reduce((s, p) => s + p.debe, 0)
        const haber = a.apuntes.reduce((s, p) => s + p.haber, 0)
        if (a.apuntes.length < 2 || debe !== haber) throw new Error('trigger de cuadre: asiento descuadrado')
        const id = nuevoId()
        const fila = Object.freeze({
          id, numero: a.numero, ejercicio: a.ejercicio, fecha: a.fecha, concepto: a.concepto, origen: a.origen,
          reversaDe: a.reversaDe ?? null, rectificadoPor: null, hash: a.hash, ...(a.hechoId ? { hechoId: a.hechoId } : {}),
          ...(a.origenTipo ? { origenTipo: a.origenTipo, origenRef: a.origenRef } : {}),
          apuntes: Object.freeze(a.apuntes.map((p, i) => Object.freeze({ orden: i + 1, cuenta: p.cuenta, debe: p.debe, haber: p.haber, documento: p.documento ?? null }))) as never,
        })
        d.asientos.push(fila as never)
        return id
      },
      async asiento(id) {
        const a = d.asientos.find((x) => x.id === id)
        if (!a) return null
        return { ...a, rectificadoPor: d.asientos.find((x) => x.reversaDe === id)?.id ?? null }
      },
      async diario({ limite, ejercicio }) {
        const xs = d.asientos.filter((a) => ejercicio === undefined || a.ejercicio === ejercicio)
          .slice().sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.numero - a.numero))
        return { asientos: xs.slice(0, limite).map((a) => ({ ...a, rectificadoPor: d.asientos.find((x) => x.reversaDe === a.id)?.id ?? null })), hayMas: xs.length > limite }
      },
      async mayor() { throw new Error('no usado en estos tests') },
      async hechoPorClave(app, tipo, ref) {
        const h = d.hechos.find((x) => x.app === app && x.tipo === tipo && x.ref === ref)
        return h ? { id: h.id, estado: h.estado, motivo: h.motivo, asientoId: h.asientoId, huella: h.huella } : null
      },
      async insertarHecho(h: NuevoHecho) {
        if (d.hechos.some((x) => x.app === h.app && x.tipo === h.tipo && x.ref === h.ref)) return null
        const id = nuevoId()
        d.hechos.push({ id, app: h.app, tipo: h.tipo, ref: h.ref, estado: 'pendiente_de_regla', motivo: 'en proceso', asientoId: null, huella: h.huella, payload: h.payload } as never)
        return id
      },
      async cerrarHecho(id, estado, motivo, asientoId) {
        const h = d.hechos.find((x) => x.id === id)!
        if (h.estado === 'asentado') throw new Error('trigger: hecho ya asentado')
        Object.assign(h, { estado, motivo, asientoId })
      },
      async reglasVigentes() {
        const r: Partial<Record<TipoHecho, Record<string, string>>> = {}
        for (const x of [...d.reglas].sort((a, b) => a.version - b.version)) r[x.tipo] = x.cuentas
        return r
      },
      async origenAutorizado(app) { return d.origenes.has(app) },
      async sumasPorCuenta({ desde, hasta }): Promise<SumaCuenta[]> {
        const m = new Map<string, SumaCuenta>()
        for (const a of d.asientos) {
          if ((desde && a.fecha < desde) || a.fecha > hasta) continue
          for (const p of a.apuntes) {
            const x = m.get(p.cuenta) ?? { cuenta: p.cuenta, debe: 0, haber: 0, n: 0 }
            x.debe += p.debe; x.haber += p.haber; x.n += 1
            m.set(p.cuenta, x)
          }
        }
        return [...m.values()]
      },
      async auditar(a) { d.auditoria.push(a) },
      async asientosPeriodo({ desde, hasta, limite }) {
        const xs = d.asientos.filter((a) => (!desde || a.fecha >= desde) && a.fecha <= hasta).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.numero - b.numero))
        return {
          truncado: xs.length > limite,
          asientos: xs.slice(0, limite).map((a) => ({ numero: a.numero, fecha: a.fecha, ejercicio: a.ejercicio, concepto: a.concepto, apuntes: a.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.debe, haber: p.haber, ...(p.documento ? { documento: p.documento } : {}) })) })),
        }
      },
      async sumasMensuales({ hasta }) {
        return sumasMensualesDeAsientos(d.asientos.filter((a) => a.fecha <= hasta).map((a) => ({ fecha: a.fecha, ejercicio: a.ejercicio, concepto: a.concepto, apuntes: a.apuntes.map((p) => ({ cuenta: p.cuenta, debe: p.debe, haber: p.haber, ...(p.documento ? { documento: p.documento } : {}) })) })))
      },
      async sumasPorDimension(dimension, { desde, hasta }) {
        const m = new Map<string, { valor: string | null; cuenta: string; debe: number; haber: number }>()
        for (const a of d.asientos) {
          if (a.fecha < desde || a.fecha > hasta) continue
          const hecho = d.hechos.find((h) => h.id === a.hechoId) as unknown as { payload?: { dimensiones?: Record<string, string> } } | undefined
          const valor = hecho?.payload?.dimensiones?.[dimension]?.trim() || null
          for (const p of a.apuntes) {
            if (p.cuenta[0] !== '6' && p.cuenta[0] !== '7') continue
            const x = m.get(`${valor}|${p.cuenta}`) ?? { valor, cuenta: p.cuenta, debe: 0, haber: 0 }
            x.debe += p.debe; x.haber += p.haber
            m.set(`${valor}|${p.cuenta}`, x)
          }
        }
        return [...m.values()]
      },
      async partidasPorDocumento(prefijos, { hasta }) {
        const m = new Map<string, { cuenta: string; documento: string | null; desde: string; debe: number; haber: number }>()
        for (const a of d.asientos) {
          if (a.fecha > hasta) continue
          for (const p of a.apuntes) {
            if (!prefijos.some((x) => p.cuenta.startsWith(x))) continue
            const k = `${p.cuenta}|${p.documento ?? ''}`
            const x = m.get(k) ?? { cuenta: p.cuenta, documento: p.documento, desde: a.fecha, debe: 0, haber: 0 }
            x.debe += p.debe; x.haber += p.haber; if (a.fecha < x.desde) x.desde = a.fecha
            m.set(k, x)
          }
        }
        return [...m.values()]
      },
      async cobrosPorMedio({ desde, hasta }) {
        const m = new Map<string | null, { medio: string | null; importe: number; n: number }>()
        for (const h of d.hechos) {
          const x = h as unknown as { tipo: string; estado: string; fecha?: string; payload?: { medio?: string; importe: number; fecha: string } }
          if (x.tipo !== 'cobro' || x.estado !== 'asentado' || !x.payload || x.payload.fecha < desde || x.payload.fecha > hasta) continue
          const k = x.payload.medio ?? null
          const f = m.get(k) ?? { medio: k, importe: 0, n: 0 }
          f.importe += x.payload.importe; f.n += 1
          m.set(k, f)
        }
        return [...m.values()]
      },
      async cobrosEfectivoAltos({ desde, umbral }) {
        return d.hechos.flatMap((h) => {
          const x = h as unknown as { tipo: string; estado: string; ref: string; payload?: { medio?: string; importe: number; fecha: string } }
          return x.tipo === 'cobro' && x.estado === 'asentado' && x.payload?.medio === 'efectivo' && x.payload.fecha >= desde && x.payload.importe >= umbral
            ? [{ ref: x.ref, fecha: x.payload.fecha, importe: x.payload.importe }] : []
        })
      },
      async contarHechos() {
        return { pendientes: d.hechos.filter((h) => h.estado === 'pendiente_de_regla').length, rechazados: d.hechos.filter((h) => h.estado === 'rechazado').length }
      },
      async guardarRegla(tipo, cuentas) {
        const version = Math.max(0, ...d.reglas.filter((r) => r.tipo === tipo).map((r) => r.version)) + 1
        d.reglas.push({ tipo, cuentas: { ...cuentas }, version })
        return version
      },
      async insertarAviso(a: Aviso) {
        if (d.avisos.some((x) => x.clave === a.clave)) return false
        d.avisos.push({ ...a, id: nuevoId(), creadoEn: aFechaISO(new Date(0)), leido: false })
        return true
      },
      async avisos({ limite }) { return d.avisos.slice(0, limite).map((a) => ({ ...a })) },
      async contarAvisosSinLeer() { return d.avisos.filter((a) => !a.leido).length },
      async marcarAvisosLeidos(usuarioId) { for (const a of d.avisos) if (!a.leido) { a.leido = true; a.leidoPor = usuarioId } },
      async contarCuentas() { return d.plan.length },
      async contarAperturasVivas(anio) { return d.asientos.filter((a) => a.ejercicio === anio && a.origen === 'apertura' && !d.asientos.some((r) => r.reversaDe === a.id)).length },
      async sembrarPlan(filas) { for (const f of filas) if (!d.plan.some((c) => c.codigo === f.codigo)) d.plan.push({ ...f }) },
      async crearEjercicio(e) {
        if (d.ejercicios.some((x) => x.anio === e.anio)) return false
        d.ejercicios.push({ ...e, ultimo: 0 })
        return true
      },
      async vinculos() { return d.vinculos.map((v) => ({ ...v })) },
      async vincular(usuarioId, rol) { if (!d.vinculos.some((v) => v.usuarioId === usuarioId)) d.vinculos.push({ usuarioId, rol, activo: true }) },
      async autorizarOrigen(app) { d.origenes.add(app) },
    }
  }

  /** Empresa lista para asentar: plan PGC sembrado y ejercicio `anio` abierto. */
  function empresaLista(empresaId: string, anio = 2026, estado: FilaEjercicio['estado'] = 'abierto', sector = 'generico') {
    const d = datos(empresaId)
    d.empresa = { razonSocial: `Empresa ${empresaId.slice(-1)}`, nif: 'B00000000', forma: 'sociedad', sector, logoUrl: null, colorPrimario: null }
    d.plan = filasSemillaPgc(sector)
    d.ejercicios.push({ anio, inicio: `${anio}-01-01`, fin: `${anio}-12-31`, estado, ultimo: 0 })
    return d
  }

  return { repo, datos, empresaLista, porEmpresa }
}
