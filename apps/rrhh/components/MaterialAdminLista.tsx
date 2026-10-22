'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TIPOS_MATERIAL, ESTADOS_MATERIAL, ESTADOS_REVISION, ETIQUETA_TIPO, ETIQUETA_ESTADO, NOTA_MAX,
  type TipoMaterial, type EstadoMaterial,
} from '@/lib/material'

type Fila = {
  id: string; empleado_id: string; empleado: string; tipo: TipoMaterial; nombre: string; nota: string | null
  estado: EstadoMaterial; estado_nota: string | null; revisado_at: string | null; revisado_por_nombre: string | null
  creado_at: string; url: string | null
}
type Empleado = { id: string; nombre: string }

const BTN_SEC = 'min-h-[44px] border border-line bg-paper-2 px-3 text-sm text-ink-2 hover:bg-line'
const COLOR_ESTADO: Record<EstadoMaterial, string> = {
  pendiente: 'bg-paper-2 text-ink-2', revisado: 'bg-ok/10 text-ok', falta_roto: 'bg-alert/10 text-alert', devuelto: 'bg-paper-2 text-ink-2',
}
const BOTON_ESTADO: Record<(typeof ESTADOS_REVISION)[number], string> = {
  revisado: 'Revisado ✓', falta_roto: 'Falta o roto', devuelto: 'Devuelto',
}
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * Material de la empresa (panel). Con `empleadoId` fijo es el bloque «Material» de la ficha del
 * empleado (sin filtro de empleado). 50 + «Ver más» que añade sin desmontar lo ya cargado.
 */
export default function MaterialAdminLista({ empleados, empleadoId }: { empleados?: Empleado[]; empleadoId?: string }) {
  const [emp, setEmp] = useState(empleadoId ?? '')
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState(empleadoId ? '' : 'pendiente')
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<{ id: string; estado: (typeof ESTADOS_REVISION)[number]; nota: string } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorFila, setErrorFila] = useState<Record<string, string>>({})
  const [ampliada, setAmpliada] = useState<string | null>(null)
  const pet = useRef(0)

  const cargar = useCallback(async (offset: number) => {
    const n = ++pet.current
    setCargando(true); setError('')
    const sp = new URLSearchParams({ offset: String(offset), limit: '50' })
    if (emp) sp.set('empleado_id', emp)
    if (tipo) sp.set('tipo', tipo)
    if (estado) sp.set('estado', estado)
    try {
      const r = await fetch(`/api/admin/material?${sp}`)
      const j = await r.json().catch(() => ({}))
      if (n !== pet.current) return
      if (!r.ok) { setError(j.error ?? 'No se pudo cargar'); return }
      setFilas(prev => offset === 0 ? j.filas : [...prev, ...j.filas])
      setHayMas(!!j.hay_mas); setTotal(j.total ?? null)
    } catch { if (n === pet.current) setError('Error de red') }
    finally { if (n === pet.current) setCargando(false) }
  }, [emp, tipo, estado])

  useEffect(() => { cargar(0) }, [cargar])

  async function guardar() {
    if (!editando) return
    setGuardando(true)
    const { id } = editando
    try {
      const r = await fetch(`/api/admin/material/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estado: editando.estado, nota: editando.nota }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErrorFila(m => ({ ...m, [id]: j.error ?? 'No se pudo guardar' })); return }
      setFilas(fs => fs.map(f => f.id === id ? { ...f, ...j.material } : f))
      setErrorFila(m => { const { [id]: _, ...resto } = m; return resto })
      setEditando(null)
    } catch { setErrorFila(m => ({ ...m, [id]: 'Error de red' })) }
    finally { setGuardando(false) }
  }

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        {!empleadoId && empleados && (
          <label className="text-xs text-ink-2">Empleado
            <select className="mt-1 block" value={emp} onChange={e => setEmp(e.target.value)}>
              <option value="">Todos</option>
              {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs text-ink-2">Tipo
          <select className="mt-1 block" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option>
            {TIPOS_MATERIAL.map(t => <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>)}
          </select>
        </label>
        <label className="text-xs text-ink-2">Estado
          <select className="mt-1 block" value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_MATERIAL.map(s => <option key={s} value={s}>{ETIQUETA_ESTADO[s]}</option>)}
          </select>
        </label>
        {total != null && <span className="pb-3 text-xs text-ink-3">{total} {total === 1 ? 'registro' : 'registros'}</span>}
      </div>

      {error && <p className="mb-2 text-sm text-alert">{error}</p>}
      {!cargando && !error && filas.length === 0 && <p className="text-sm text-ink-3">No hay material con estos filtros.</p>}

      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {filas.map(f => (
          <li key={f.id} className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-card">
            {f.url
              ? <button type="button" onClick={() => setAmpliada(f.url)} className="block aspect-[4/3] w-full bg-paper-2 p-0" aria-label={`Ampliar foto de ${f.nombre}`}>
                  <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              : <div className="grid aspect-[4/3] w-full place-items-center bg-paper-2 text-xs text-ink-3">Foto no disponible</div>}
            <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words font-semibold">{f.nombre}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ESTADO[f.estado] ?? ''}`}>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</span>
              </div>
              <p className="text-xs text-ink-3">
                {ETIQUETA_TIPO[f.tipo] ?? f.tipo} · {!empleadoId && <a href={`/admin/empleados/${f.empleado_id}`} className="text-accent no-underline hover:underline">{f.empleado || '—'}</a>}{!empleadoId && ' · '}{fecha(f.creado_at)}
              </p>
              {f.nota && <p className="break-words text-xs text-ink-2">«{f.nota}»</p>}
              {f.estado_nota && <p className="break-words text-xs text-ink-2">RRHH: {f.estado_nota}</p>}
              {f.revisado_at && <p className="text-xs text-ink-3">Revisado {fecha(f.revisado_at)}{f.revisado_por_nombre ? ` por ${f.revisado_por_nombre}` : ''}</p>}

              {editando?.id === f.id ? (
                <div className="mt-2 grid gap-2">
                  <p className="text-xs font-medium">Marcar como «{BOTON_ESTADO[editando.estado]}»</p>
                  <textarea rows={2} maxLength={NOTA_MAX} placeholder="Nota (opcional)" value={editando.nota}
                    onChange={e => setEditando({ ...editando, nota: e.target.value })} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={guardar} disabled={guardando} className="min-h-[44px] flex-1 px-3 text-sm">
                      {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button type="button" onClick={() => setEditando(null)} disabled={guardando} className={BTN_SEC}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {ESTADOS_REVISION.map(s => (
                    <button key={s} type="button" disabled={f.estado === s}
                      onClick={() => setEditando({ id: f.id, estado: s, nota: f.estado === s ? (f.estado_nota ?? '') : '' })}
                      className={`${BTN_SEC} flex-1 whitespace-nowrap disabled:opacity-50`}>
                      {BOTON_ESTADO[s]}
                    </button>
                  ))}
                </div>
              )}
              {errorFila[f.id] && <p className="text-xs text-alert">{errorFila[f.id]}</p>}
            </div>
          </li>
        ))}
      </ul>

      {cargando && <p className="mt-3 text-sm text-ink-3">Cargando…</p>}
      {hayMas && !cargando && (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => cargar(filas.length)} className={BTN_SEC}>Ver más</button>
        </div>
      )}

      {ampliada && (
        <div onClick={() => setAmpliada(null)} className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-2">
          <img src={ampliada} alt="Foto ampliada" className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
