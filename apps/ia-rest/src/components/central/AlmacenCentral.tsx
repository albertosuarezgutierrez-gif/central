'use client'
import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Articulo {
  id: string; nombre: string; stock_actual: number; stock_minimo: number
  unidad_compra: string; notas: string | null
}
interface Props { sh: () => Record<string, string> }

export default function AlmacenPortal({ sh }: Props) {
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'bajos' | 'ok'>('todos')
  const [entradaModal, setEntradaModal] = useState<Articulo | null>(null)
  const [qty, setQty] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const r = await fetch('/api/owner/stock', { headers: sh() })
    const d = await r.json()
    setArticulos(d.articulos ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const registrarEntrada = async () => {
    if (!entradaModal || !qty) return
    setGuardando(true)
    await fetch('/api/owner/stock?action=entrada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ articulo_id: entradaModal.id, cantidad: parseFloat(qty), notas: nota }),
    })
    setEntradaModal(null); setQty(''); setNota('')
    setGuardando(false); cargar()
  }

  const filtrados = articulos.filter(a =>
    filtro === 'bajos' ? a.stock_actual <= a.stock_minimo :
    filtro === 'ok' ? a.stock_actual > a.stock_minimo : true
  )
  const bajos = articulos.filter(a => a.stock_actual <= a.stock_minimo).length

  if (loading) return <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 4 }}>ALMACÉN</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Stock actual</div>
          {bajos > 0 && <div style={{ background: C.redS, border: `1px solid ${C.red}44`, borderRadius: 6, padding: '4px 12px', fontFamily: SN, fontSize: 12, color: C.redD, fontWeight: 600 }}>⚠ {bajos} bajo mínimo</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['todos', 'bajos', 'ok'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{ fontFamily: SN, fontSize: 11, fontWeight: 600, padding: '5px 13px', background: filtro === f ? C.ink : C.paper2, color: filtro === f ? C.paper : C.ink2, border: `1px solid ${filtro === f ? C.ink : C.rule}`, borderRadius: 20, cursor: 'pointer' }}>
            {f === 'todos' ? `Todos (${articulos.length})` : f === 'bajos' ? `⚠ Bajos (${bajos})` : `OK (${articulos.length - bajos})`}
          </button>
        ))}
      </div>
      <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 90px', padding: '8px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paper2 }}>
          {['Artículo', 'Stock', 'Mínimo', 'Unidad', ''].map((h, i) => (
            <div key={i} style={{ fontFamily: SM, fontSize: 9, color: C.ink3, fontWeight: 700, letterSpacing: '.08em', textAlign: i > 0 ? 'center' : 'left' }}>{h}</div>
          ))}
        </div>
        {filtrados.length === 0 && <div style={{ padding: '24px', textAlign: 'center', fontFamily: SN, fontSize: 12, color: C.ink3 }}>Sin artículos</div>}
        {filtrados.map(a => {
          const bajo = a.stock_actual <= a.stock_minimo
          return (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 80px 90px', padding: '10px 14px', borderBottom: `1px solid ${C.ruleS}`, background: bajo ? '#FFF8F5' : C.bone }}>
              <div>
                <div style={{ fontFamily: SN, fontSize: 13, color: C.ink, fontWeight: bajo ? 600 : 400 }}>{a.nombre}</div>
                {a.notas && <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3 }}>{a.notas}</div>}
              </div>
              <div style={{ textAlign: 'center', fontFamily: SM, fontSize: 13, color: bajo ? C.red : C.green, fontWeight: 700 }}>{a.stock_actual}</div>
              <div style={{ textAlign: 'center', fontFamily: SM, fontSize: 12, color: C.ink3 }}>{a.stock_minimo}</div>
              <div style={{ textAlign: 'center', fontFamily: SN, fontSize: 11, color: C.ink3 }}>{a.unidad_compra}</div>
              <div style={{ textAlign: 'center' }}>
                <button onClick={() => setEntradaModal(a)} style={{ fontFamily: SN, fontSize: 10, fontWeight: 600, background: C.green, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>+ Entrada</button>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 14, fontFamily: SN, fontSize: 11, color: C.ink3 }}>
        Para crear o editar artículos → <a href="/owner?tab=bodega" style={{ color: C.red }}>Panel del dueño · Almacén</a>
      </div>
      {entradaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 12, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 18, color: C.ink, marginBottom: 4 }}>Registrar entrada</div>
            <div style={{ fontFamily: SN, fontSize: 13, color: C.ink2, marginBottom: 16 }}>{entradaModal.nombre}</div>
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 6 }}>Cantidad ({entradaModal.unidad_compra})</div>
            <input value={qty} onChange={e => setQty(e.target.value)} type="number" min="0" step="0.1"
              style={{ width: '100%', fontFamily: SN, fontSize: 14, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', marginBottom: 10, color: C.ink, outline: 'none' }} />
            <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 6 }}>Nota (opcional)</div>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="albarán nº..."
              style={{ width: '100%', fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 10px', marginBottom: 16, color: C.ink, outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEntradaModal(null)} style={{ fontFamily: SN, fontSize: 12, background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 6, padding: '8px 16px', cursor: 'pointer', color: C.ink2 }}>Cancelar</button>
              <button onClick={registrarEntrada} disabled={!qty || guardando} style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, background: guardando ? C.ruleS : C.green, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}>
                {guardando ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
