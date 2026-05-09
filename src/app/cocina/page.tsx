'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const K={bg:'#0D0B08',c1:'#0A0807',fg:'#F6F1E7',fg2:'#C9BFAA',fg3:'#8D8270',rule:'#2F2820',rS:'#4A3F33',red:'#D9442B',amb:'#E8A33B',gr:'#3F7D44'}
const SE="'Newsreader',Georgia,serif"
const SN="'Inter Tight',system-ui,sans-serif"
const SM="'JetBrains Mono',ui-monospace,monospace"

type Item = { id: string; nombre: string; cantidad: number; notas: string | null; estado: string; seccion_id: string | null }
type Comanda = { id: string; created_at: string; mesa_id: string; camarero_id: string | null; items: Item[]; mesa?: { codigo: string }; camarero?: { nombre: string }; numero_ticket: number }

function edadColor(iso: string) { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 10 ? K.gr : m < 20 ? K.amb : K.red }

function CocinaInner() {
  const { session, checking } = useAuth(['cocina', 'jefe_sala', 'super_admin'])
  const searchParams = useSearchParams()
  const paramSeccion = searchParams.get('seccion')
  const seccionFiltro = paramSeccion ?? session?.seccion_id ?? null

  const [comandas, setComandasState] = useState<Comanda[]>([])
  const [time, setTime] = useState(new Date())
  const [seccionNombre, setSeccionNombre] = useState('')

  const fetchSeccion = useCallback(async () => {
    if (!session || !seccionFiltro) return
    const { data } = await supabase.from('secciones_cocina').select('nombre').eq('id', seccionFiltro).single()
    if (data) setSeccionNombre(data.nombre)
  }, [session, seccionFiltro])

  const fetchData = useCallback(async () => {
    if (!session) return
    const { data } = await supabase
      .from('comandas')
      .select('id,created_at,mesa_id,camarero_id,numero_ticket,mesa:mesas(codigo),camarero:camareros(nombre),items:comanda_items(id,nombre,cantidad,notas,estado,seccion_id)')
      .eq('restaurante_id', session.restaurante_id)
      .in('tipo', ['comanda', 'marchar'])
      .in('estado', ['nueva', 'en_cocina'])
      .order('created_at', { ascending: true })
    if (data) setComandasState(data as unknown as Comanda[])
  }, [session])

  useEffect(() => {
    if (!session) return
    fetchSeccion()
    fetchData()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (supabase.channel('cocina-simple') as any)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_items' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas' }, fetchData)
      .subscribe()
    const t = setInterval(() => { fetchData(); setTime(new Date()) }, 5000)
    const c = setInterval(() => setTime(new Date()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t); clearInterval(c) }
  }, [session, fetchData, fetchSeccion])

  const toggle = async (itemId: string, estado: string) => {
    await supabase.from('comanda_items').update({ estado: estado === 'listo' ? 'pendiente' : 'listo' }).eq('id', itemId)
    fetchData()
  }

  const comandasFiltradas = comandas.map(c => {
    if (!seccionFiltro) return c
    return { ...c, items: (c.items || []).filter(it => it.seccion_id === seccionFiltro) }
  }).filter(c => !seccionFiltro || (c.items && c.items.length > 0))

  // Solo items pendientes agrupados por comanda
  const pendientes = comandasFiltradas.flatMap(c =>
    (c.items || []).filter(it => it.estado !== 'listo').map(it => ({ ...it, mesa: c.mesa?.codigo, col: edadColor(c.created_at), comanda_id: c.id }))
  )

  if (checking || !session) return <div style={{ minHeight: '100dvh', background: K.bg }} />

  return (
    <div style={{ minHeight: '100dvh', background: K.bg, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* Header mínimo */}
      <div style={{ padding: '12px 20px', background: K.c1, borderBottom: `1px solid ${K.rule}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: SM, fontSize: 10, color: K.fg3, letterSpacing: '.14em', fontWeight: 700 }}>
          {seccionNombre ? seccionNombre.toUpperCase() : 'COCINA'}
        </span>
        <span style={{ fontFamily: SM, fontSize: 20, fontWeight: 700, color: K.fg }}>
          {time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Contenido */}
      {pendientes.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <span style={{ fontFamily: SE, fontSize: 48, color: K.fg3, fontStyle: 'italic' }}>Libre.</span>
          <span style={{ fontFamily: SM, fontSize: 11, color: '#2F2820', letterSpacing: '.1em' }}>
            {seccionNombre ? seccionNombre.toUpperCase() : 'COCINA'} · SIN PENDIENTES
          </span>
        </div>
      ) : (
        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
          {pendientes.map(it => (
            <div
              key={it.id}
              onClick={() => toggle(it.id, it.estado)}
              style={{
                background: K.c1,
                border: `1px solid ${K.rS}`,
                borderLeft: `4px solid ${it.col}`,
                borderRadius: 0,
                padding: '20px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                animation: it.col === K.red ? 'pulse 1.5s ease-in-out infinite' : 'none',
              }}
            >
              <span style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: K.fg2, minWidth: 56, textAlign: 'center', lineHeight: 1 }}>
                {it.mesa}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SM, fontSize: 26, fontWeight: 700, color: K.fg, letterSpacing: '.02em', lineHeight: 1, textTransform: 'uppercase' }}>
                  {it.cantidad > 1 && <span style={{ color: K.red, marginRight: 8 }}>{it.cantidad}x</span>}
                  {it.nombre}
                </div>
                {it.notas && (
                  <div style={{ fontFamily: SN, fontSize: 14, color: K.amb, marginTop: 6 }}>{it.notas}</div>
                )}
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 4, border: `2px solid ${K.rS}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <polyline points="2 8 6 12 14 4" stroke={K.fg3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contador en footer */}
      {pendientes.length > 0 && (
        <div style={{ padding: '10px 20px', borderTop: `1px solid ${K.rule}`, display: 'flex', justifyContent: 'space-between', background: K.c1 }}>
          <span style={{ fontFamily: SM, fontSize: 10, color: K.fg3, letterSpacing: '.1em' }}>
            {pendientes.length} PLATO{pendientes.length !== 1 ? 'S' : ''} PENDIENTE{pendientes.length !== 1 ? 'S' : ''}
          </span>
          <span style={{ fontFamily: SM, fontSize: 10, color: K.fg3, letterSpacing: '.08em' }}>
            TAP PARA MARCAR LISTO
          </span>
        </div>
      )}
    </div>
  )
}

export default function CocinaPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#F6F1E7' }} />}>
      <CocinaInner />
    </Suspense>
  )
}
