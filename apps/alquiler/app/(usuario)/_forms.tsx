'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }
const formBox: React.CSSProperties = { marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }

type MaterialOpt = { id: string; nombre: string }

function useSubmit(endpoint: string, method: 'POST' | 'PATCH' = 'POST') {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(body: unknown, query = '') {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(endpoint + query, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Error al guardar')
        return false
      }
      setOpen(false)
      router.refresh()
      return true
    } finally {
      setSaving(false)
    }
  }
  return { open, setOpen, saving, error, submit }
}

function Actions({ c }: { c: ReturnType<typeof useSubmit> }) {
  return (
    <>
      {c.error && <div className="badge danger" style={{ marginTop: 8 }}>{c.error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} disabled={c.saving}>{c.saving ? '…' : 'Guardar'}</button>
        <a className="muted" style={{ cursor: 'pointer', alignSelf: 'center' }} onClick={() => c.setOpen(false)}>Cancelar</a>
      </div>
    </>
  )
}

function Overlay({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 50, overflow: 'auto' }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(680px,100%)', marginTop: 32 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function EditIcon({ onClick }: { onClick: () => void }) {
  return <a onClick={onClick} className="muted" style={{ cursor: 'pointer', marginRight: 10 }} title="Editar">✏️</a>
}

// ─── Material ────────────────────────────────────────────────────────────────
type MForm = { nombre: string; categoria: string; stockTotal: string; tarifaDia: string; fianzaUnit: string }
const materialVacio: MForm = { nombre: '', categoria: '', stockTotal: '', tarifaDia: '', fianzaUnit: '' }

function MaterialFields({ f, set }: { f: MForm; set: (k: string, v: unknown) => void }) {
  return (
    <div style={inputRow}>
      <input placeholder="Nombre" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} required />
      <input placeholder="Categoría" value={f.categoria} onChange={(e) => set('categoria', e.target.value)} />
      <input placeholder="Stock" value={f.stockTotal} onChange={(e) => set('stockTotal', e.target.value)} />
      <input placeholder="Tarifa €/día" value={f.tarifaDia} onChange={(e) => set('tarifaDia', e.target.value)} />
      <input placeholder="Fianza €/ud" value={f.fianzaUnit} onChange={(e) => set('fianzaUnit', e.target.value)} />
    </div>
  )
}

export function NuevoMaterial() {
  const c = useSubmit('/api/materiales')
  const [f, setF] = useState<MForm>(materialVacio)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)}>+ Nuevo material</button>
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(materialVacio) }} style={formBox}>
      <MaterialFields f={f} set={set} />
      <Actions c={c} />
    </form>
  )
}

export function EditMaterial({ m }: { m: { id: string; nombre: string; categoria?: string | null; stockTotal: number; tarifaDia?: number | null; fianzaUnit?: number | null } }) {
  const c = useSubmit('/api/materiales', 'PATCH')
  const init = (): MForm => ({ nombre: m.nombre, categoria: m.categoria ?? '', stockTotal: m.stockTotal.toString(), tarifaDia: m.tarifaDia?.toString() ?? '', fianzaUnit: m.fianzaUnit?.toString() ?? '' })
  const [f, setF] = useState<MForm>(init)
  const set = (k: string, val: unknown) => setF((p) => ({ ...p, [k]: val }))
  return (
    <>
      <EditIcon onClick={() => { setF(init()); c.setOpen(true) }} />
      {c.open && (
        <Overlay title="Editar material" onClose={() => c.setOpen(false)}>
          <form onSubmit={async (e) => { e.preventDefault(); await c.submit(f, `?id=${m.id}`) }}>
            <MaterialFields f={f} set={set} />
            <Actions c={c} />
          </form>
        </Overlay>
      )}
    </>
  )
}

// ─── Alquiler ────────────────────────────────────────────────────────────────
type LineaForm = { materialId: string; cantidad: string }
type AForm = { clienteNombre: string; aTerceros: boolean; fechaInicio: string; fechaFin: string; estado: string; fianza: string; lineas: LineaForm[] }
const estadosAlquiler = ['reservado', 'entregado', 'devuelto', 'cancelado']

function AlquilerFields({
  f,
  set,
  setF,
  materiales,
}: {
  f: AForm
  set: (k: string, v: unknown) => void
  setF: React.Dispatch<React.SetStateAction<AForm>>
  materiales: MaterialOpt[]
}) {
  const setLinea = (i: number, k: string, v: unknown) =>
    setF((p) => ({ ...p, lineas: p.lineas.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)) }))
  const addLinea = () =>
    setF((p) => ({ ...p, lineas: [...p.lineas, { materialId: materiales[0]?.id ?? '', cantidad: '1' }] }))
  const removeLinea = (i: number) =>
    setF((p) => ({ ...p, lineas: p.lineas.length > 1 ? p.lineas.filter((_, idx) => idx !== i) : p.lineas }))

  return (
    <>
      <div style={inputRow}>
        <input placeholder="Cliente" value={f.clienteNombre} onChange={(e) => set('clienteNombre', e.target.value)} />
        <input type="date" value={f.fechaInicio} onChange={(e) => set('fechaInicio', e.target.value)} />
        <input type="date" value={f.fechaFin} onChange={(e) => set('fechaFin', e.target.value)} />
        <input placeholder="Fianza €" value={f.fianza} onChange={(e) => set('fianza', e.target.value)} />
        <select value={f.estado} onChange={(e) => set('estado', e.target.value)}>
          {estadosAlquiler.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={f.aTerceros} onChange={(e) => set('aTerceros', e.target.checked)} /> a terceros
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="muted" style={{ marginBottom: 6, fontSize: 13 }}>Líneas (material + cantidad)</div>
        {f.lineas.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 32px', gap: 8, marginBottom: 6 }}>
            <select value={l.materialId} onChange={(e) => setLinea(i, 'materialId', e.target.value)}>
              {materiales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <input placeholder="Cantidad" value={l.cantidad} onChange={(e) => setLinea(i, 'cantidad', e.target.value)} />
            <a
              onClick={() => removeLinea(i)}
              className="muted"
              title={f.lineas.length > 1 ? 'Quitar línea' : 'Debe haber al menos una línea'}
              style={{ cursor: f.lineas.length > 1 ? 'pointer' : 'not-allowed', alignSelf: 'center', textAlign: 'center', opacity: f.lineas.length > 1 ? 1 : 0.4 }}
            >🗑</a>
          </div>
        ))}
        <a onClick={addLinea} className="muted" style={{ cursor: 'pointer', fontSize: 13 }} title="Añadir línea">+ añadir línea</a>
      </div>
    </>
  )
}

const lineaVacia = (materiales: MaterialOpt[]): LineaForm => ({ materialId: materiales[0]?.id ?? '', cantidad: '1' })

export function NuevoAlquiler({ materiales }: { materiales: MaterialOpt[] }) {
  const c = useSubmit('/api/alquileres')
  const hoy = new Date().toISOString().slice(0, 10)
  const init = (): AForm => ({ clienteNombre: '', aTerceros: true, fechaInicio: hoy, fechaFin: hoy, estado: 'reservado', fianza: '', lineas: [lineaVacia(materiales)] })
  const [f, setF] = useState<AForm>(init)
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  if (!c.open)
    return <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => c.setOpen(true)} disabled={materiales.length === 0}>+ Nuevo alquiler</button>
  return (
    <form onSubmit={async (e) => { e.preventDefault(); const ok = await c.submit(f); if (ok) setF(init()) }} style={formBox}>
      <AlquilerFields f={f} set={set} setF={setF} materiales={materiales} />
      <Actions c={c} />
    </form>
  )
}

export function EditAlquiler({ a, materiales }: { a: { id: string; clienteNombre?: string | null; aTerceros: boolean; fechaInicio: string; fechaFin: string; estado: string; fianza?: number | null; lineas: { materialId: string; cantidad: number }[] }; materiales: MaterialOpt[] }) {
  const c = useSubmit('/api/alquileres', 'PATCH')
  const init = (): AForm => ({
    clienteNombre: a.clienteNombre ?? '',
    aTerceros: a.aTerceros,
    fechaInicio: a.fechaInicio,
    fechaFin: a.fechaFin,
    estado: a.estado,
    fianza: a.fianza?.toString() ?? '',
    lineas: a.lineas.length
      ? a.lineas.map((l) => ({ materialId: l.materialId, cantidad: l.cantidad.toString() }))
      : [lineaVacia(materiales)],
  })
  const [f, setF] = useState<AForm>(init)
  const set = (k: string, val: unknown) => setF((p) => ({ ...p, [k]: val }))
  return (
    <>
      <EditIcon onClick={() => { setF(init()); c.setOpen(true) }} />
      {c.open && (
        <Overlay title="Editar alquiler" onClose={() => c.setOpen(false)}>
          <form onSubmit={async (e) => { e.preventDefault(); await c.submit(f, `?id=${a.id}`) }}>
            <AlquilerFields f={f} set={set} setF={setF} materiales={materiales} />
            <Actions c={c} />
          </form>
        </Overlay>
      )}
    </>
  )
}

// ─── Borrado ─────────────────────────────────────────────────────────────────
export function DeleteButton({ endpoint, id }: { endpoint: string; id: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function del() {
    if (!confirm('¿Borrar este registro?')) return
    setBusy(true)
    const res = await fetch(`${endpoint}?id=${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error || 'No se pudo borrar')
      return
    }
    router.refresh()
  }
  return <a onClick={del} className="muted" style={{ cursor: 'pointer' }} title="Borrar">{busy ? '…' : '🗑'}</a>
}
