'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const ESTADOS = [
  { key: 'pendiente',  label: 'Pedido recibido', sub: 'Esperando confirmación' },
  { key: 'confirmado', label: 'Confirmado',       sub: 'Lo hemos recibido' },
  { key: 'en_cocina',  label: 'En cocina',        sub: 'Preparando tu pedido' },
  { key: 'listo',      label: 'Listo',            sub: 'Preparado para entregar' },
  { key: 'entregado',  label: 'Entregado',        sub: '¡Disfrútalo!' },
]

interface Pedido {
  id: string
  numero: number
  estado: string
  tipo: 'delivery' | 'recogida'
  cliente_nombre: string
  items: Array<{ nombre: string; cantidad: number; precio_unitario: number }>
  total: number
  created_at: string
}

export default function TrackingPage({ params }: { params: { slug: string; id: string } }) {
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch(`/api/storefront/pedido?id=${params.id}`)
      .then(r => r.json())
      .then(d => { if (d.pedido) setPedido(d.pedido) })
      .finally(() => setCargando(false))

    const ch = supabase.channel(`tracking-${params.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'pedidos_online',
        filter: `id=eq.${params.id}`,
      }, payload => {
        setPedido(prev => prev ? { ...prev, ...(payload.new as Partial<Pedido>) } : prev)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [params.id])

  if (cargando) return (
    <div className="min-h-screen bg-[#14110E] flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-[3px] border-[#D9442B] border-t-transparent animate-spin" />
    </div>
  )

  if (!pedido) return (
    <div className="min-h-screen bg-[#14110E] flex items-center justify-center" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <p className="text-[#9C8E7E]">Pedido no encontrado</p>
    </div>
  )

  const estadoIdx = ESTADOS.findIndex(e => e.key === pedido.estado)
  const estadoActual = ESTADOS[estadoIdx]

  return (
    <div className="min-h-screen bg-[#14110E]" style={{ fontFamily: 'Inter Tight, sans-serif' }}>
      <div className="max-w-md mx-auto px-4 py-8">

        {/* Estado principal */}
        <div className="text-center mb-8">
          <p className="text-xs text-[#9C8E7E] uppercase tracking-widest mb-2">Pedido #{pedido.numero}</p>
          <h1 className="text-2xl font-bold text-[#F6F1E7] mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
            {estadoActual?.label ?? pedido.estado}
          </h1>
          <p className="text-sm text-[#9C8E7E]">{estadoActual?.sub}</p>
          {pedido.estado !== 'entregado' && (
            <p className="text-xs text-[#4A3F35] mt-2 animate-pulse">Actualizando en tiempo real…</p>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] p-5 mb-4">
          <div className="space-y-0">
            {ESTADOS.map((estado, idx) => {
              const completado = idx <= estadoIdx
              const activo = idx === estadoIdx
              const ultimo = idx === ESTADOS.length - 1
              return (
                <div key={estado.key} className="flex gap-4">
                  {/* Línea vertical + círculo */}
                  <div className="flex flex-col items-center">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
                      style={{
                        background: completado ? '#D9442B' : '#2A2420',
                        color: completado ? '#F6F1E7' : '#4A3F35',
                        transform: activo ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: activo ? '0 0 0 3px #D9442B30' : 'none',
                      }}
                    >
                      {completado && !activo ? '✓' : idx + 1}
                    </div>
                    {!ultimo && (
                      <div className="w-0.5 h-6 mt-1 mb-1 transition-all"
                        style={{ background: idx < estadoIdx ? '#D9442B' : '#2A2420' }} />
                    )}
                  </div>
                  {/* Texto */}
                  <div className={`flex-1 ${!ultimo ? 'pb-1' : ''} pt-1`}>
                    <p className="text-sm font-semibold"
                      style={{ color: completado ? '#F6F1E7' : '#4A3F35' }}>
                      {estado.label}
                    </p>
                    {activo && (
                      <p className="text-xs text-[#D9442B] mt-0.5">{estado.sub}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Resumen */}
        <div className="bg-[#1E1A16] rounded-2xl border border-[#2A2420] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2A2420]">
            <p className="text-xs font-bold text-[#9C8E7E] uppercase tracking-wide">
              {pedido.tipo === 'delivery' ? 'Delivery' : 'Recogida en local'}
            </p>
          </div>
          {pedido.items.map((item, i) => (
            <div key={i}
              className={`flex justify-between px-4 py-2.5 text-sm ${i < pedido.items.length - 1 ? 'border-b border-[#2A2420]' : ''}`}>
              <span className="text-[#D8CDB6]">
                <span className="text-[#9C8E7E] mr-2">{item.cantidad}×</span>
                {item.nombre}
              </span>
              <span className="text-[#9C8E7E]">
                {(item.precio_unitario * item.cantidad).toFixed(2)} €
              </span>
            </div>
          ))}
          <div className="px-4 py-3 border-t border-[#2A2420] flex justify-between">
            <span className="text-sm font-bold text-[#F6F1E7]">Total</span>
            <span className="text-sm font-bold text-[#D9442B]"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              {pedido.total.toFixed(2)} €
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-[#2A2420] mt-6">
          Esta página se actualiza sola
        </p>
      </div>
    </div>
  )
}
