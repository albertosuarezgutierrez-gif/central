'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

/**
 * RecomendacionesTab — /owner → Carta → Recomend.
 * El dueño gestiona qué productos recomienda hoy, con horario y/o cantidad límite.
 */

import { useState, useEffect, useCallback } from 'react'

// ── Design tokens (light, igual que el resto de /owner) ─────────

interface Rec {
  id: string
  producto_id: string
  nota: string | null
  hora_desde: string | null
  hora_hasta: string | null
  cantidad_max: number | null
  cantidad_servida: number
  fecha: string
  activa: boolean
  productos: { nombre: string; precio: number; categoria: string } | null
}

interface Producto {
  id: string
  nombre: string
  precio: number | null
  categoria: string
}

interface Props {
  restauranteId: string
  sh: () => Record<string, string>
}

const FORM0 = { producto_id:'', nota:'', hora_desde:'', hora_hasta:'', cantidad_max:'' }

export default function RecomendacionesTab({ restauranteId, sh }: Props) {
  const [recs,      setRecs]      = useState<Rec[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading,   setLoading]   = useState(true)
  const [form,      setForm]      = useState(FORM0)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const today = new Date().toISOString().split('T')[0]

  const cargar = useCallback(async () => {
    setLoading(true)
    const [rr, pr] = await Promise.all([
      fetch('/api/owner/recomendaciones', { headers: sh() }),
      fetch('/api/owner/carta', { headers: sh() }),
    ])
    const rd = await rr.json()
    const pd = await pr.json()
    setRecs(rd.recomendaciones ?? [])
    setProductos((pd.productos ?? []).filter((p: Producto & { activo?: boolean }) => p.activo !== false))
    setLoading(false)
  }, [sh])

  useEffect(() => { cargar() }, [cargar])

  const crear = async () => {
    if (!form.producto_id) { setError('Elige un producto'); return }
    setSaving(true); setError('')
    const r = await fetch('/api/owner/recomendaciones', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', ...sh() },
      body: JSON.stringify({
        producto_id:  form.producto_id,
        nota:         form.nota      || null,
        hora_desde:   form.hora_desde || null,
        hora_hasta:   form.hora_hasta || null,
        cantidad_max: form.cantidad_max ? parseInt(form.cantidad_max) : null,
      }),
    })
    const d = await r.json()
    if (!d.ok) { setError(d.error || 'Error'); setSaving(false); return }
    setForm(FORM0)
    await cargar()
    setSaving(false)
  }

  const toggle = async (rec: Rec) => {
    await fetch('/api/owner/recomendaciones', {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json', ...sh() },
      body: JSON.stringify({ id: rec.id, activa: !rec.activa }),
    })
    await cargar()
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar esta recomendación?')) return
    await fetch('/api/owner/recomendaciones', {
      method:'DELETE',
      headers:{ 'Content-Type':'application/json', ...sh() },
      body: JSON.stringify({ id }),
    })
    await cargar()
  }

  const fmtH = (t: string | null) => t ? t.slice(0,5) : null
  const todayRecs = recs.filter(r => r.fecha === today)
  const pastRecs  = recs.filter(r => r.fecha !== today)

  return (
    <div style={{ maxWidth:680, margin:'0 auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Título ────────────────────────────────────────── */}
      <div>
        <h2 style={{ fontFamily:SE, fontStyle:'italic', fontSize:22, color:C.ink, margin:0 }}>Recomendaciones del día</h2>
        <p style={{ fontFamily:SN, fontSize:13, color:C.ink3, margin:'4px 0 0' }}>
          Destaca productos con nota del chef, horario y/o límite de unidades. El camarero lo ve en su pantalla.
        </p>
      </div>

      {/* ── Formulario nueva recomendación ────────────────── */}
      <div style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:12, padding:18, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ fontFamily:SN, fontWeight:700, fontSize:13, color:C.ink2 }}>+ Nueva recomendación</div>

        {/* Producto */}
        <div>
          <label style={{ display:'block', fontFamily:SN, fontSize:12, color:C.ink3, marginBottom:4 }}>Producto *</label>
          <select
            value={form.producto_id}
            onChange={e => setForm(f => ({ ...f, producto_id: e.target.value }))}
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SN, fontSize:14, background:C.bg, color:C.ink, appearance:'auto' }}
          >
            <option value="">Elige un producto…</option>
            {productos.map(p => (
              <option key={p.id} value={p.id}>{p.nombre} — {Number(p.precio||0).toFixed(2)} €</option>
            ))}
          </select>
        </div>

        {/* Nota del chef */}
        <div>
          <label style={{ display:'block', fontFamily:SN, fontSize:12, color:C.ink3, marginBottom:4 }}>Nota del chef (opcional)</label>
          <input
            value={form.nota}
            onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
            placeholder="Ej: muy tierno hoy, recién llegado del mercado"
            maxLength={120}
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SC, fontSize:15, background:C.bg, color:C.ink, boxSizing:'border-box' as const }}
          />
        </div>

        {/* Horario */}
        <div style={{ display:'flex', gap:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ display:'block', fontFamily:SN, fontSize:12, color:C.ink3, marginBottom:4 }}>Desde (opcional)</label>
            <input type="time" value={form.hora_desde} onChange={e => setForm(f => ({ ...f, hora_desde: e.target.value }))}
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SM, fontSize:13, background:C.bg, color:C.ink, boxSizing:'border-box' as const }} />
          </div>
          <div style={{ flex:1 }}>
            <label style={{ display:'block', fontFamily:SN, fontSize:12, color:C.ink3, marginBottom:4 }}>Hasta (opcional)</label>
            <input type="time" value={form.hora_hasta} onChange={e => setForm(f => ({ ...f, hora_hasta: e.target.value }))}
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SM, fontSize:13, background:C.bg, color:C.ink, boxSizing:'border-box' as const }} />
          </div>
        </div>

        {/* Cantidad máx */}
        <div style={{ maxWidth:200 }}>
          <label style={{ display:'block', fontFamily:SN, fontSize:12, color:C.ink3, marginBottom:4 }}>Cantidad máxima (opcional)</label>
          <input
            type="number" min="1" value={form.cantidad_max}
            onChange={e => setForm(f => ({ ...f, cantidad_max: e.target.value }))}
            placeholder="Sin límite"
            style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${C.rule}`, fontFamily:SM, fontSize:14, background:C.bg, color:C.ink, boxSizing:'border-box' as const }}
          />
        </div>

        {error && <div style={{ fontFamily:SN, fontSize:12, color:C.red }}>{error}</div>}

        <button
          onClick={crear}
          disabled={saving}
          style={{ alignSelf:'flex-start', padding:'10px 22px', borderRadius:8, border:'none', background:C.red, color:'#fff', fontFamily:SN, fontWeight:700, fontSize:13, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1 }}
        >
          {saving ? 'Guardando…' : 'Añadir recomendación'}
        </button>
      </div>

      {/* ── Lista de hoy ──────────────────────────────────── */}
      {loading ? (
        <div style={{ fontFamily:SN, fontSize:13, color:C.ink4, padding:12 }}>Cargando…</div>
      ) : (
        <>
          {todayRecs.length > 0 && (
            <div>
              <div style={{ fontFamily:SN, fontWeight:700, fontSize:12, color:C.ink3, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:10 }}>Hoy</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {todayRecs.map(r => {
                  const p = r.productos
                  const restante = r.cantidad_max !== null ? r.cantidad_max - r.cantidad_servida : null
                  const agotando = restante !== null && restante <= 3
                  return (
                    <div key={r.id} style={{ background:C.bg, border:`1px solid ${r.activa ? C.rule : C.bg3}`, borderRadius:10, padding:'12px 14px', opacity:r.activa?1:0.5, display:'flex', alignItems:'flex-start', gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontFamily:SN, fontWeight:600, fontSize:14, color:C.ink }}>{p?.nombre ?? '—'}</span>
                          <span style={{ fontFamily:SM, fontSize:12, color:C.amb }}>{Number(p?.precio||0).toFixed(2)} €</span>
                          {!r.activa && <span style={{ fontFamily:SM, fontSize:10, color:C.ink4, background:C.bg2, padding:'1px 6px', borderRadius:4 }}>inactiva</span>}
                        </div>
                        {r.nota && <p style={{ fontFamily:SC, fontSize:14, color:C.ink3, margin:'0 0 6px', lineHeight:1.4 }}>&ldquo;{r.nota}&rdquo;</p>}
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                          {(r.hora_desde || r.hora_hasta) && (
                            <span style={{ fontFamily:SM, fontSize:11, color:C.green, background:C.greenS, padding:'2px 7px', borderRadius:5 }}>
                              {fmtH(r.hora_desde) ?? '00:00'} – {fmtH(r.hora_hasta) ?? '24:00'}
                            </span>
                          )}
                          {r.cantidad_max !== null && (
                            <span style={{ fontFamily:SM, fontSize:11, color: agotando ? C.amb : C.ink3, background: agotando ? C.ambS : C.bg2, padding:'2px 7px', borderRadius:5, border:`1px solid ${agotando ? C.amb+'44' : C.rule}` }}>
                              {r.cantidad_servida} / {r.cantidad_max} servidos
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={() => toggle(r)}
                          style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${C.rule}`, background:'transparent', fontFamily:SN, fontSize:11, color:C.ink3, cursor:'pointer' }}>
                          {r.activa ? 'Pausar' : 'Activar'}
                        </button>
                        <button onClick={() => eliminar(r.id)}
                          style={{ padding:'5px 10px', borderRadius:6, border:`1px solid ${C.redS}`, background:'transparent', fontFamily:SN, fontSize:11, color:C.red, cursor:'pointer' }}>
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {todayRecs.length === 0 && (
            <div style={{ textAlign:'center', padding:'30px 20px', background:C.bg2, borderRadius:12, border:`1px dashed ${C.rule}` }}>
              <div style={{ fontFamily:SE, fontStyle:'italic', fontSize:18, color:C.ink3, marginBottom:6 }}>Sin recomendaciones hoy</div>
              <div style={{ fontFamily:SN, fontSize:13, color:C.ink4 }}>Añade platos del día o especiales del chef</div>
            </div>
          )}

          {/* Historial */}
          {pastRecs.length > 0 && (
            <details style={{ marginTop:8 }}>
              <summary style={{ fontFamily:SN, fontSize:12, color:C.ink4, cursor:'pointer', userSelect:'none' as const }}>
                Historial ({pastRecs.length} del últimos 7 días)
              </summary>
              <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
                {pastRecs.map(r => (
                  <div key={r.id} style={{ background:C.bg2, border:`1px solid ${C.rule}`, borderRadius:8, padding:'8px 12px', opacity:0.7, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontFamily:SN, fontSize:13, color:C.ink3 }}>{r.productos?.nombre ?? '—'}</span>
                    <span style={{ fontFamily:SM, fontSize:11, color:C.ink4 }}>{r.fecha}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
