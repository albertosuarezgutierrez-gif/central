// Fake en memoria de `RepoContable` para probar los casos de uso sin BD. Imita las garantías de 0001 que importan aquí:
// datos separados por empresa, clave única de hechos (ON CONFLICT DO NOTHING → null), número correlativo por ejercicio y
// solo-añadir (no expone ningún UPDATE/DELETE de asientos; los guarda congelados).
import type {
  RepoContable, FilaCuenta, FilaEjercicio, AsientoLeido, FilaHecho, NuevoAsiento, NuevoHecho, EntradaAuditoria, SumaCuenta, FilaEmpresa,
} from '../lib/repo.ts'
import type { TipoHecho } from '../lib/hecho-entrada.ts'
import { filasSemillaPgc } from '../lib/alta-empresa.ts'

type Datos = {
  empresa: FilaEmpresa | null
  plan: FilaCuenta[]
  ejercicios: (FilaEjercicio & { ultimo: number })[]
  asientos: (AsientoLeido & { hash: string; hechoId?: string })[]
  hechos: (FilaHecho & { app: string; tipo: TipoHecho; ref: string })[]
  reglas: { tipo: TipoHecho; cuentas: Record<string, string>; version: number }[]
  origenes: Set<string>
  vinculos: { usuarioId: string; rol: 'dueno' | 'gestor'; activo: boolean }[]
  auditoria: EntradaAuditoria[]
}

export function crearAlmacen() {
  const porEmpresa = new Map<string, Datos>()
  let seq = 0
  const nuevoId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const datos = (e: string): Datos => {
    if (!porEmpresa.has(e)) {
      porEmpresa.set(e, { empresa: null, plan: [], ejercicios: [], asientos: [], hechos: [], reglas: [], origenes: new Set(), vinculos: [], auditoria: [] })
    }
    return porEmpresa.get(e)!
  }

  function repo(empresaId: string): RepoContable {
    const d = datos(empresaId)
    return {
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
        const debe = a.apuntes.reduce((s, p) => s + p.debe, 0)
        const haber = a.apuntes.reduce((s, p) => s + p.haber, 0)
        if (a.apuntes.length < 2 || debe !== haber) throw new Error('trigger de cuadre: asiento descuadrado')
        const id = nuevoId()
        const fila = Object.freeze({
          id, numero: a.numero, ejercicio: a.ejercicio, fecha: a.fecha, concepto: a.concepto, origen: a.origen,
          reversaDe: a.reversaDe ?? null, rectificadoPor: null, hash: a.hash, ...(a.hechoId ? { hechoId: a.hechoId } : {}),
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
        d.hechos.push({ id, app: h.app, tipo: h.tipo, ref: h.ref, estado: 'pendiente_de_regla', motivo: 'en proceso', asientoId: null, huella: h.huella })
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
      async contarCuentas() { return d.plan.length },
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
  function empresaLista(empresaId: string, anio = 2026, estado: FilaEjercicio['estado'] = 'abierto') {
    const d = datos(empresaId)
    d.empresa = { razonSocial: `Empresa ${empresaId.slice(-1)}`, nif: 'B00000000', forma: 'sociedad', sector: 'generico', logoUrl: null, colorPrimario: null }
    d.plan = filasSemillaPgc()
    d.ejercicios.push({ anio, inicio: `${anio}-01-01`, fin: `${anio}-12-31`, estado, ultimo: 0 })
    return d
  }

  return { repo, datos, empresaLista, porEmpresa }
}
