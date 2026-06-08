'use client'
// src/components/central/StockCentral.tsx
// Almacén central del grupo — stock, transferencias entre locales

import { useState, useEffect, useCallback } from 'react'

const C = {
  bg:'#14110E', bg2:'#1C1814', bg3:'#221E1A',
  red:'#D9442B', ink:'#F6F1E7', ink2:'#D8CDB6', ink3:'#9C8E7E', ink4:'#6B5F52',
  rule:'#2E2A26', green:'#3F7D44', amber:'#E8A33B',
}
const SN = 'Inter Tight, system-ui, sans-serif'
const SM = 'Inter Tight, system-ui, sans-serif'
const SE = 'Newsreader, Georgia, serif'

type Articulo = {
  id: string; nombre: string; unidad: string; categoria: string | null
  cantidad_total: number; cantidad_disponible: number; cantidad_reservada: number
  coste_unitario: number | null; stock_minimo: number; tipo_stock: string
}

type Transferencia = {
  id: string; articulo_nombre: string; cantidad: number; unidad: string
  origen_tipo: string; destino_tipo: string; estado: string
  creado_at: string; notas: string | null
}

type Local = { restaurante_id: string; restaurante_nombre: string }

interface Props {
  sh: () => Record<string, string>
  locales: Local[]
}

export default function StockCentral({ sh, locales }: Props) {
  const [subtab, setSubtab] = useState<'stock'|'transferencias'>('stock')
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [transferencias, setTransferencias] = useState<Transferencia[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [showNuevo, setShowNuevo] = useState(false)
  const [showTransf, setShowTransf] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('todos')

  // Form nuevo artículo
  const [form, setForm] = useState({ nombre:'', unidad:'ud', cantidad_total:0, coste_unitario:'', stock_minimo:0, categoria:'', tipo_stock:'propio' })
  // Form transferencia
  const [tForm, setTForm] = useState({ articulo_nombre:'', cantidad:1, unidad:'ud', destino_id:'', destino_tipo:'restaurante', origen_tipo:'central', notas:'' })

  const cargarStock = useCallback(async () => {
    try {
      const r = await fetch('/api/central/stock', { headers: sh() })
      const d = await r.json()
      setArticulos(d.stock ?? [])
    } finally { setLoading(false) }
  }, [sh])

  const cargarTransferencias = useCallback(async () => {
    const url = filtroEstado === 'todos' ? '/api/central/transferencias' : `/api/central/transferencias?estado=${filtroEstado}`
    const r = await fetch(url, { headers: sh() })
    const d = await r.json()
    setTransferencias(d.transferencias ?? [])
  }, [sh, filtroEstado])

  useEffect(() => { cargarStock() }, [cargarStock])
  useEffect(() => { if (subtab === 'transferencias') cargarTransferencias() }, [subtab, cargarTransferencias])

  const guardarArticulo = async () => {
    await fetch('/api/central/stock', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ ...form, coste_unitario: form.coste_unitario ? Number(form.coste_unitario) : null }),
    })
    setShowNuevo(false)
    setForm({ nombre:'', unidad:'ud', cantidad_total:0, coste_unitario:'', stock_minimo:0, categoria:'', tipo_stock:'propio' })
    cargarStock()
  }

  const actualizarCantidad = async (id: string, campo: string, valor: number) => {
    await fetch('/api/central/stock', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, [campo]: valor }),
    })
    cargarStock()
  }

  const crearTransferencia = async () => {
    await fetch('/api/central/transferencias', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify(tForm),
    })
    setShowTransf(false)
    setTForm({ articulo_nombre:'', cantidad:1, unidad:'ud', destino_id:'', destino_tipo:'restaurante', origen_tipo:'central', notas:'' })
    cargarTransferencias()
  }

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/central/transferencias', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, estado }),
    })
    cargarTransferencias()
  }

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '8px 10px', background: C.bg,
    border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink,
    fontFamily: SN, fontSize: 13, boxSizing: 'border-box', ...style,
  })

  const estadoColor: Record<string, string> = {
    pendiente: C.amber, en_transito: '#2B6A6E', recibido: C.green, cancelado: C.ink4
  }

  if (loading) return <div style={{ color: C.ink4, fontSize: 13, padding: 20 }}>Cargando...</div>

  return (
    <div>
      {/* Subtabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['stock','Stock central'],['transferencias','Transferencias']] as const).map(([id,label]) => (
          <button key={id} onClick={() => setSubtab(id)} style={{
            padding: '7px 16px', borderRadius: 20,
            border: `1px solid ${subtab===id ? C.red : C.rule}`,
            background: subtab===id ? C.red : 'transparent',
            color: subtab===id ? '#fff' : C.ink3,
            fontFamily: SN, fontSize: 13, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* STOCK */}
      {subtab === 'stock' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: C.ink4 }}>{articulos.length} artículos</div>
            <button onClick={() => setShowNuevo(true)} style={{
              padding: '7px 14px', background: C.red, border: 'none', borderRadius: 8,
              fontFamily: SN, fontSize: 13, color: '#fff', cursor: 'pointer',
            }}>+ Añadir artículo</button>
          </div>

          {/* Form nuevo */}
          {showNuevo && (
            <div style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Nuevo artículo</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Nombre *</div><input style={inp()} value={form.nombre} onChange={e => setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Numanthia Toro" /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Unidad</div><input style={inp()} value={form.unidad} onChange={e => setForm(p=>({...p,unidad:e.target.value}))} placeholder="ud / kg / l / botella" /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Cantidad inicial</div><input type="number" style={inp()} value={form.cantidad_total} onChange={e => setForm(p=>({...p,cantidad_total:Number(e.target.value)}))} /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Coste unitario (€)</div><input type="number" style={inp()} value={form.coste_unitario} onChange={e => setForm(p=>({...p,coste_unitario:e.target.value}))} placeholder="0.00" /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Stock mínimo alerta</div><input type="number" style={inp()} value={form.stock_minimo} onChange={e => setForm(p=>({...p,stock_minimo:Number(e.target.value)}))} /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Categoría</div><input style={inp()} value={form.categoria} onChange={e => setForm(p=>({...p,categoria:e.target.value}))} placeholder="vino / carne / limpieza..." /></div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Tipo de stock</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['propio','Propio'],['consignacion','Consignación']].map(([v,l]) => (
                    <button key={v} onClick={() => setForm(p=>({...p,tipo_stock:v}))} style={{
                      padding: '5px 12px', borderRadius: 20, border: `1px solid ${form.tipo_stock===v?C.red:C.rule}`,
                      background: form.tipo_stock===v?C.red:'transparent', color: form.tipo_stock===v?'#fff':C.ink3,
                      fontFamily: SN, fontSize: 12, cursor: 'pointer',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={guardarArticulo} disabled={!form.nombre} style={{ padding: '8px 18px', background: form.nombre?C.red:C.rule, border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 13, color: '#fff', cursor: form.nombre?'pointer':'not-allowed' }}>Guardar</button>
                <button onClick={() => setShowNuevo(false)} style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.ink4, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista artículos */}
          {articulos.map(a => {
            const critico = a.cantidad_disponible <= a.stock_minimo && a.stock_minimo > 0
            return (
              <div key={a.id} style={{ background: critico ? '#2E1010' : C.bg3, border: `1px solid ${critico?C.red+'44':C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{a.nombre}</div>
                    <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>{a.categoria ?? 'sin categoría'} · {a.tipo_stock}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: critico ? C.red : C.green }}>
                      {a.cantidad_disponible} <span style={{ fontSize: 12, fontStyle: 'normal' }}>{a.unidad}</span>
                    </div>
                    {critico && <div style={{ fontSize: 10, color: C.red }}>⚠ bajo mínimo ({a.stock_minimo})</div>}
                  </div>
                </div>

                {editando === a.id ? (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      ['cantidad_total','Total'],['cantidad_disponible','Disponible'],
                      ['cantidad_reservada','Reservada'],['stock_minimo','Mínimo alerta'],
                    ].map(([campo, label]) => (
                      <div key={campo}>
                        <div style={{ fontSize: 11, color: C.ink4, marginBottom: 3 }}>{label}</div>
                        <input type="number" defaultValue={a[campo as keyof Articulo] as number}
                          onBlur={e => actualizarCantidad(a.id, campo, Number(e.target.value))}
                          style={inp({ width: '100%' })}
                        />
                      </div>
                    ))}
                    <button onClick={() => setEditando(null)} style={{ gridColumn: '1/-1', padding: '7px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, color: C.ink4, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>Cerrar edición</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => setEditando(a.id)} style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 20, color: C.ink4, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>✎ Editar</button>
                    <button onClick={() => { setTForm(p=>({...p,articulo_nombre:a.nombre,unidad:a.unidad})); setShowTransf(true) }}
                      style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 20, color: C.ink4, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>↗ Transferir</button>
                  </div>
                )}
              </div>
            )
          })}
          {articulos.length === 0 && <div style={{ fontSize: 13, color: C.ink4, textAlign: 'center' as const, padding: '40px 0' }}>Sin artículos en el almacén central.<br/>Añade el primero arriba.</div>}
        </div>
      )}

      {/* TRANSFERENCIAS */}
      {subtab === 'transferencias' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
              {['todos','pendiente','en_transito','recibido','cancelado'].map(e => (
                <button key={e} onClick={() => setFiltroEstado(e)} style={{
                  padding: '5px 12px', borderRadius: 20, border: `1px solid ${filtroEstado===e?C.red:C.rule}`,
                  background: filtroEstado===e?C.red:'transparent', color: filtroEstado===e?'#fff':C.ink3,
                  fontFamily: SN, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' as const,
                }}>{e}</button>
              ))}
            </div>
            <button onClick={() => setShowTransf(true)} style={{ padding: '7px 14px', background: C.red, border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 13, color: '#fff', cursor: 'pointer' }}>+ Nueva transferencia</button>
          </div>

          {/* Form transferencia */}
          {showTransf && (
            <div style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>Nueva transferencia</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Artículo *</div>
                  <input list="articulos-list" style={inp()} value={tForm.articulo_nombre} onChange={e => setTForm(p=>({...p,articulo_nombre:e.target.value}))} placeholder="Nombre del artículo" />
                  <datalist id="articulos-list">{articulos.map(a => <option key={a.id} value={a.nombre}/>)}</datalist>
                </div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Cantidad *</div><input type="number" style={inp()} value={tForm.cantidad} onChange={e => setTForm(p=>({...p,cantidad:Number(e.target.value)}))} /></div>
                <div><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Unidad</div><input style={inp()} value={tForm.unidad} onChange={e => setTForm(p=>({...p,unidad:e.target.value}))} /></div>
                <div>
                  <div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Origen</div>
                  <select style={inp()} value={tForm.origen_tipo} onChange={e => setTForm(p=>({...p,origen_tipo:e.target.value}))}>
                    <option value="central">Almacén central</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="restaurante">Otro local</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Destino (local)</div>
                  <select style={inp()} value={tForm.destino_id} onChange={e => setTForm(p=>({...p,destino_id:e.target.value}))}>
                    <option value="">Seleccionar local...</option>
                    {locales.map(l => <option key={l.restaurante_id} value={l.restaurante_id}>{l.restaurante_nombre}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}><div style={{ fontSize: 11, color: C.ink4, marginBottom: 4 }}>Notas</div><input style={inp()} value={tForm.notas} onChange={e => setTForm(p=>({...p,notas:e.target.value}))} placeholder="Opcional" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={crearTransferencia} disabled={!tForm.articulo_nombre||!tForm.destino_id} style={{ padding: '8px 18px', background: tForm.articulo_nombre&&tForm.destino_id?C.red:C.rule, border: 'none', borderRadius: 8, fontFamily: SN, fontSize: 13, color: '#fff', cursor: 'pointer' }}>Crear transferencia</button>
                <button onClick={() => setShowTransf(false)} style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SN, fontSize: 13, color: C.ink4, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Lista transferencias */}
          {transferencias.map(t => (
            <div key={t.id} style={{ background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{t.articulo_nombre}</div>
                  <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>{t.cantidad} {t.unidad} · {t.origen_tipo} → {t.destino_tipo}</div>
                  {t.notas && <div style={{ fontSize: 11, color: C.ink3, marginTop: 2 }}>{t.notas}</div>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: estadoColor[t.estado]+'22', color: estadoColor[t.estado] }}>
                  {t.estado}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {t.estado === 'pendiente'    && <button onClick={() => cambiarEstado(t.id,'en_transito')} style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${C.rule}`, background:'transparent', color:C.ink3, fontFamily:SN, fontSize:11, cursor:'pointer' }}>↗ Marcar enviado</button>}
                {t.estado === 'en_transito'  && <button onClick={() => cambiarEstado(t.id,'recibido')}    style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${C.green}`, background:'transparent', color:C.green, fontFamily:SN, fontSize:11, cursor:'pointer' }}>✓ Confirmar recibido</button>}
                {(t.estado === 'pendiente' || t.estado === 'en_transito') && <button onClick={() => cambiarEstado(t.id,'cancelado')} style={{ padding:'4px 10px', borderRadius:20, border:`1px solid ${C.rule}`, background:'transparent', color:C.ink4, fontFamily:SN, fontSize:11, cursor:'pointer' }}>✕ Cancelar</button>}
              </div>
              <div style={{ fontSize: 10, color: C.ink4, marginTop: 6 }}>{new Date(t.creado_at).toLocaleDateString('es-ES')}</div>
            </div>
          ))}
          {transferencias.length === 0 && <div style={{ fontSize: 13, color: C.ink4, textAlign: 'center' as const, padding: '40px 0' }}>Sin transferencias{filtroEstado!=='todos'?` con estado "${filtroEstado}"`:''}.</div>}
        </div>
      )}
    </div>
  )
}
