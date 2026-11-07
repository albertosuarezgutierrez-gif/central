// Fake en memoria de `RepoF6` que imita los triggers/FK de 0006: el objeto comentado/revisado debe existir en la MISMA empresa (FK compuesta), el autor
// debe tener vínculo ACTIVO con el rol que declara (trigger `autor_vinculado`), una sola revisión por (objeto, rol) (0008), y comentarios/revisiones solo se añaden.
import type { ObjetoComentable, TerceroImportado } from '@central/module-contabilidad'
import type { ComentarioLeido, NuevaRevision, NuevoComentario, RepoF6 } from '../lib/repo-f6.ts'
import type { crearAlmacen } from './_repo-memoria.ts'

type DatosEmpresa = ReturnType<ReturnType<typeof crearAlmacen>['datos']>
export type EstadoF6 = {
  comentarios: (NuevoComentario & { id: string; creadoEn: string })[]
  revisiones: NuevaRevision[]
  terceros: (TerceroImportado & { activo: boolean })[]
  facturas: { id: string; origen: string; proveedor: string; numero: string; fecha: string; total: number }[]
  avisosSinLeer: number
  borradores: number
  nombres: Record<string, string>
}
const estados = new WeakMap<object, EstadoF6>()
let seq = 0

export function f6Memoria(d: DatosEmpresa): RepoF6 & { estado: EstadoF6 } {
  if (!estados.has(d)) estados.set(d, { comentarios: [], revisiones: [], terceros: [], facturas: [], avisosSinLeer: 0, borradores: 0, nombres: {} })
  const st = estados.get(d)!
  const abiertos = () => new Set(d.ejercicios.filter((e) => e.estado === 'abierto').map((e) => e.anio))
  const asientosPend = () => d.asientos.filter((a) => a.origen !== 'apertura' && a.origen !== 'cierre' && abiertos().has(a.ejercicio) && !st.revisiones.some((r) => r.tipo === 'asiento' && r.id === a.id && r.rol === 'gestor'))
  const facturasPend = () => st.facturas.filter((f) => f.origen !== 'manual' && !st.revisiones.some((r) => r.tipo === 'factura_recibida' && r.id === f.id && r.rol === 'gestor'))
  const existe = (tipo: 'asiento' | 'factura_recibida', id: string) => (tipo === 'asiento' ? d.asientos.some((a) => a.id === id) : st.facturas.some((f) => f.id === id))
  const autorOk = (usuarioId: string, rol: string) => {
    if (!d.vinculos.some((v) => v.usuarioId === usuarioId && v.activo && v.rol === rol)) throw new Error('trigger autor_vinculado: sin acceso activo con ese rol')
  }
  const delObjeto = (c: { objeto: ObjetoComentable }, o: ObjetoComentable) => c.objeto.tipo === o.tipo && (o.tipo === 'documento' ? (c.objeto as { ref: string }).ref === o.ref : (c.objeto as { id: string }).id === o.id)
  return {
    estado: st,
    async contarAsientosSinRevisar() { return asientosPend().length },
    async contarFacturasAConfirmar() { return facturasPend().length },
    async contarAvisosSinLeer() { return st.avisosSinLeer },
    async contarDeclaracionesBorrador() { return st.borradores },
    async asientosSinRevisar(limite) {
      return asientosPend().slice(0, limite).map((a) => ({ id: a.id, numero: a.numero, ejercicio: a.ejercicio, fecha: a.fecha, concepto: a.concepto, comentarios: st.comentarios.filter((c) => c.objeto.tipo === 'asiento' && c.objeto.id === a.id).length }))
    },
    async facturasAConfirmar(limite) {
      return facturasPend().slice(0, limite).map((f) => ({ id: f.id, proveedor: f.proveedor, numero: f.numero, fecha: f.fecha, total: f.total, origen: f.origen, comentarios: 0 }))
    },
    async comentarios(objeto): Promise<ComentarioLeido[]> {
      return st.comentarios.filter((c) => delObjeto(c, objeto)).map((c) => ({ id: c.id, rol: c.rol, autor: st.nombres[c.usuarioId] ?? c.usuarioId, texto: c.texto, creadoEn: c.creadoEn }))
    },
    async insertarComentario(c) {
      if (c.objeto.tipo !== 'documento' && !existe(c.objeto.tipo, c.objeto.id)) throw new Error('FK compuesta: el objeto no es de esta empresa')
      autorOk(c.usuarioId, c.rol)
      const id = `c0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      st.comentarios.push({ ...c, id, creadoEn: new Date(2026, 0, 1, 0, 0, seq).toISOString() })
      return id
    },
    async insertarRevision(r) {
      if (!existe(r.tipo, r.id)) throw new Error('FK compuesta: el objeto no es de esta empresa')
      autorOk(r.usuarioId, r.rol)
      if (st.revisiones.some((x) => x.tipo === r.tipo && x.id === r.id && x.rol === r.rol)) return false // 0008: única por (objeto, rol)
      st.revisiones.push({ ...r })
      return true
    },
    async insertarTerceros(ts, _u) {
      let nuevos = 0
      for (const t of ts) if (!st.terceros.some((x) => x.nif === t.nif && x.tipo === t.tipo)) { st.terceros.push({ ...t, activo: true }); nuevos++ }
      return { nuevos, repetidos: ts.length - nuevos }
    },
    async terceros(limite) { return st.terceros.slice(0, limite).map((t) => ({ ...t })) },
    async contarTerceros() { return st.terceros.length },
    async marcarCuentasNoHoja(codigos) { for (const c of d.plan) if (codigos.includes(c.codigo)) c.admiteApuntes = false },
  }
}
