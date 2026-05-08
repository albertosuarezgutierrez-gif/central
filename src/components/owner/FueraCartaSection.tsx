'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface FueraCartaProducto {
  id: string
  nombre: string
  precio: number
  descripcion: string | null
  categoria: string
  alergenos: string[]
  expira_at: string | null
  expira_label: string
  horas_restantes: number | null
}

interface SeccionCocina {
  id: string
  nombre: string
}

interface NuevoEspecial {
  nombre: string
  precio: string
  descripcion: string
  categoria: string
  alergenos: string[]
  seccion_id: string
  dias: number
}

const ALERGENOS_EU = [
  'Gluten', 'Crustáceos', 'Huevo', 'Pescado', 'Cacahuetes',
  'Soja', 'Lácteos', 'Frutos de cáscara', 'Apio', 'Mostaza',
  'Sésamo', 'Dióxido de azufre', 'Altramuces', 'Moluscos'
]

const CATEGORIAS_DEFAULT = [
  'Especiales', 'Entrantes', 'Principales', 'Postres', 'Bebidas', 'Sugerencias del chef'
]

const OPCION_DIAS = [
  { label: 'Solo hoy', value: 0 },
  { label: '1 día',    value: 1 },
  { label: '2 días',   value: 2 },
  { label: '3 días',   value: 3 },
  { label: '5 días',   value: 5 },
  { label: '1 semana', value: 7 },
]

// ── Badge expiración ──────────────────────────────────────────
function ExpiraBadge({ label, horas }: { label: string; horas: number | null }) {
  const urgente = horas !== null && horas < 2
  const pronto  = horas !== null && horas < 6
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
      background: urgente ? '#A8311E22' : pronto ? '#E8A33B22' : '#3F7D4422',
      color:      urgente ? '#D9442B'   : pronto ? '#E8A33B'   : '#3F7D44',
      border:     `1px solid ${urgente ? '#D9442B44' : pronto ? '#E8A33B44' : '#3F7D4444'}`,
    }}>
      {urgente ? '⚡' : pronto ? '⏳' : '📅'} {label}
    </span>
  )
}

// ── Modal nuevo especial ──────────────────────────────────────
function ModalNuevoEspecial({
  restauranteId, secciones, onCreado, onCerrar,
}: {
  restauranteId: string; secciones: SeccionCocina[]
  onCreado: () => void; onCerrar: () => void
}) {
  const [form, setForm] = useState<NuevoEspecial>({
    nombre: '', precio: '', descripcion: '',
    categoria: 'Especiales', alergenos: [], seccion_id: '', dias: 1,
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const toggleAlergeno = (a: string) =>
    setForm((f: NuevoEspecial) => ({
      ...f,
      alergenos: f.alergenos.includes(a) ? f.alergenos.filter((x: string) => x !== a) : [...f.alergenos, a],
    }))

  const guardar = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.precio || isNaN(parseFloat(form.precio))) { setError('Precio no válido'); return }
    setGuardando(true); setError('')

    const { error: err } = await supabase.rpc('crear_fuera_carta', {
      p_restaurante_id: restauranteId,
      p_nombre:         form.nombre.trim(),
      p_precio:         parseFloat(form.precio),
      p_descripcion:    form.descripcion.trim() || null,
      p_categoria:      form.categoria,
      p_alergenos:      form.alergenos,
      p_seccion_id:     form.seccion_id || null,
      p_dias:           form.dias,
    })

    if (err) { setError(err.message); setGuardando(false); return }
    onCreado(); onCerrar()
  }

  const IS: object = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: '#14110E', border: '1px solid #2C2520', color: '#F6F1E7', outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(20,17,14,0.88)', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: '100%', maxWidth: 480, borderRadius: 16, overflow: 'hidden', background: '#1C1814', border: '1px solid #2C2520', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #2C2520' }}>
          <div>
            <p style={{ color: '#F6F1E7', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 600, fontSize: 15, margin: 0 }}>Nuevo especial fuera de carta</p>
            <p style={{ color: '#6B5F52', fontSize: 11, margin: '2px 0 0', fontStyle: 'italic' }}>Se añade a la carta y desaparece solo al expirar</p>
          </div>
          <button onClick={onCerrar} style={{ color: '#6B5F52', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Nombre *</label>
            <input value={form.nombre} onChange={(e: any) => setForm((f: any) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Chuletón de vaca vieja…" style={IS} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Precio (€) *</label>
              <input type="number" step="0.5" min="0" value={form.precio} onChange={(e: any) => setForm((f: any) => ({ ...f, precio: e.target.value }))} placeholder="0.00" style={{ ...IS, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Categoría</label>
              <select value={form.categoria} onChange={(e: any) => setForm((f: any) => ({ ...f, categoria: e.target.value }))} style={IS as object}>
                {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Descripción <span style={{ color: '#6B5F52' }}>(opcional)</span></label>
            <textarea value={form.descripcion} onChange={(e: any) => setForm((f: any) => ({ ...f, descripcion: e.target.value }))} placeholder="Notas para sala o cocina…" rows={2} style={{ ...IS, resize: 'none' } as object} />
          </div>
          {secciones.length > 0 && (
            <div>
              <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>Partida de cocina</label>
              <select value={form.seccion_id} onChange={(e: any) => setForm((f: any) => ({ ...f, seccion_id: e.target.value }))} style={IS as object}>
                <option value="">Sin asignar</option>
                {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 8 }}>¿Hasta cuándo está disponible?</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OPCION_DIAS.map(op => (
                <button key={op.value} onClick={() => setForm((f: any) => ({ ...f, dias: op.value }))} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 500, background: form.dias === op.value ? '#D9442B' : '#14110E', color: form.dias === op.value ? '#F6F1E7' : '#6B5F52', border: `1px solid ${form.dias === op.value ? '#D9442B' : '#2C2520'}` }}>
                  {op.label}
                </button>
              ))}
            </div>
            <p style={{ color: '#6B5F52', fontSize: 11, margin: '6px 0 0', fontStyle: 'italic' }}>Se desactiva automáticamente a las 23:59 del último día</p>
          </div>
          <div>
            <label style={{ color: '#D8CDB6', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 8 }}>Alérgenos <span style={{ color: '#6B5F52' }}>(EU 1169/2011)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALERGENOS_EU.map(a => (
                <button key={a} onClick={() => toggleAlergeno(a)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: form.alergenos.includes(a) ? '#E8A33B22' : '#14110E', color: form.alergenos.includes(a) ? '#E8A33B' : '#6B5F52', border: `1px solid ${form.alergenos.includes(a) ? '#E8A33B' : '#2C2520'}` }}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          {error && <p style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: '#D9442B22', color: '#D9442B', border: '1px solid #D9442B44', margin: 0 }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid #2C2520' }}>
          <button onClick={onCerrar} style={{ flex: 1, padding: 10, borderRadius: 10, fontSize: 13, cursor: 'pointer', background: '#14110E', color: '#6B5F52', border: '1px solid #2C2520' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{ flex: 1, padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: guardando ? '#6B5F52' : '#D9442B', color: '#F6F1E7', border: 'none', opacity: guardando ? 0.6 : 1 }}>
            {guardando ? 'Añadiendo…' : '+ Añadir a carta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────
// Uso: <FueraCartaSection restauranteId={restauranteId} />
// Insertar en CartaTab de owner/page.tsx al inicio de view === 'lista'
export default function FueraCartaSection({ restauranteId }: { restauranteId: string }) {
  const [productos, setProductos]   = useState<FueraCartaProducto[]>([])
  const [secciones, setSecciones]   = useState<SeccionCocina[]>([])
  const [cargando, setCargando]     = useState(true)
  const [modalAbierto, setModal]    = useState(false)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [{ data: prods }, { data: secc }] = await Promise.all([
      supabase.from('v_fuera_carta_activos').select('*').eq('restaurante_id', restauranteId),
      supabase.from('secciones_cocina').select('id, nombre').eq('restaurante_id', restauranteId).order('nombre'),
    ])
    setProductos(prods ?? [])
    setSecciones(secc ?? [])
    setCargando(false)
  }, [restauranteId])

  useEffect(() => { cargar() }, [cargar])

  const eliminar = async (id: string) => {
    setEliminando(id)
    await supabase.from('productos').update({ activo: false, es_fuera_carta: false }).eq('id', id).eq('restaurante_id', restauranteId)
    await cargar()
    setEliminando(null)
  }

  return (
    <>
      <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 24, border: '1px solid #D9442B33', background: '#1C1814' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#D9442B0A', borderBottom: productos.length > 0 ? '1px solid #2C2520' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#D9442B', fontSize: 12 }}>✦</span>
            <span style={{ color: '#F6F1E7', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 600, fontSize: 14 }}>Fuera de carta</span>
            {productos.length > 0 && (
              <span style={{ background: '#D9442B22', color: '#D9442B', fontSize: 11, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 5 }}>{productos.length}</span>
            )}
          </div>
          <button onClick={() => setModal(true)} style={{ background: '#D9442B', color: '#F6F1E7', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Añadir especial
          </button>
        </div>

        {cargando ? (
          <div style={{ padding: '18px 14px', textAlign: 'center', color: '#6B5F52', fontSize: 13 }}>Cargando…</div>
        ) : productos.length === 0 ? (
          <div style={{ padding: '18px 14px', textAlign: 'center' }}>
            <p style={{ color: '#6B5F52', fontSize: 13, margin: 0 }}>Sin especiales activos hoy</p>
            <p style={{ color: '#3A332C', fontSize: 12, margin: '4px 0 0', fontStyle: 'italic' }}>El chuletón de hoy, el postre especial…</p>
          </div>
        ) : (
          productos.map((p: FueraCartaProducto, i: number) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px', gap: 12, borderTop: i > 0 ? '1px solid #2C2520' : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: '#F6F1E7', fontWeight: 600, fontSize: 14 }}>{p.nombre}</span>
                  <ExpiraBadge label={p.expira_label} horas={p.horas_restantes} />
                </div>
                {p.descripcion && <p style={{ color: '#6B5F52', fontSize: 12, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ color: '#E8A33B', fontFamily: 'monospace', fontSize: 13 }}>{Number(p.precio).toFixed(2)} €</span>
                  {p.categoria !== 'Especiales' && <span style={{ color: '#6B5F52', fontSize: 11 }}>{p.categoria}</span>}
                  {p.alergenos?.length > 0 && <span style={{ color: '#E8A33B', fontSize: 11 }}>⚠ {p.alergenos.slice(0, 2).join(', ')}{p.alergenos.length > 2 ? ` +${p.alergenos.length - 2}` : ''}</span>}
                </div>
              </div>
              <button onClick={() => eliminar(p.id)} disabled={eliminando === p.id} style={{ color: '#6B5F52', border: '1px solid #2C2520', background: '#14110E', padding: '4px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', flexShrink: 0, opacity: eliminando === p.id ? 0.4 : 1 }}>
                {eliminando === p.id ? '…' : 'Quitar'}
              </button>
            </div>
          ))
        )}
      </div>

      {modalAbierto && (
        <ModalNuevoEspecial
          restauranteId={restauranteId}
          secciones={secciones}
          onCreado={cargar}
          onCerrar={() => setModal(false)}
        />
      )}
    </>
  )
}
