'use client'

/**
 * FueraCartaPill — Componente para /edge (camarero)
 * Muestra una pill vermilion bajo el header SOLO cuando hay especiales activos.
 * Al pulsar, abre un drawer desde abajo con la lista completa.
 *
 * Uso en edge/page.tsx, justo después del cierre del div HEADER:
 *   <FueraCartaPill restauranteId={session.restaurante_id} />
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface Especial {
  id: string
  nombre: string
  precio: number
  descripcion: string | null
  categoria: string
  alergenos: string[]
  expira_label: string
  horas_restantes: number | null
}

// ── Drawer ────────────────────────────────────────────────────
function EspecialesDrawer({ especiales, onCerrar }: { especiales: Especial[]; onCerrar: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCerrar])

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(20,17,14,0.65)', backdropFilter: 'blur(3px)' }} onClick={onCerrar} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: '#1C1814', borderRadius: '20px 20px 0 0', border: '1px solid #2C2520', borderBottom: 'none', maxHeight: '75vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: '#2C2520' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 14px', borderBottom: '1px solid #2C2520' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#D9442B' }}>✦</span>
            <span style={{ color: '#F6F1E7', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 600, fontSize: 16 }}>Especiales de hoy</span>
            <span style={{ background: '#D9442B22', color: '#D9442B', fontSize: 11, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 5 }}>{especiales.length}</span>
          </div>
          <button onClick={onCerrar} style={{ background: '#14110E', color: '#9A8D7C', border: '1px solid #2C2520', padding: '5px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
        </div>

        {/* Lista */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {especiales.map((e) => {
            const h = e.horas_restantes
            const urgente = h !== null && h < 2
            const pronto  = h !== null && h < 6
            return (
              <div key={e.id} style={{ padding: 14, borderRadius: 12, background: '#14110E', border: '1px solid #2C2520' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#F6F1E7', fontFamily: 'Newsreader, Georgia, serif', fontWeight: 600, fontSize: 16, lineHeight: 1.3 }}>{e.nombre}</span>
                  <span style={{ color: '#E8A33B', fontFamily: 'monospace', fontSize: 15, flexShrink: 0 }}>{Number(e.precio).toFixed(2)} €</span>
                </div>
                {e.descripcion && <p style={{ color: '#6B5F52', fontSize: 13, margin: '6px 0 0', lineHeight: 1.5 }}>{e.descripcion}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    {e.alergenos?.length > 0 && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, color: '#E8A33B', background: '#E8A33B11', border: '1px solid #E8A33B33' }}>
                        ⚠ {e.alergenos.join(', ')}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6, background: urgente ? '#A8311E22' : pronto ? '#E8A33B22' : '#3F7D4422', color: urgente ? '#D9442B' : pronto ? '#E8A33B' : '#3F7D44', border: `1px solid ${urgente ? '#D9442B44' : pronto ? '#E8A33B44' : '#3F7D4444'}` }}>
                    {urgente ? '⚡' : pronto ? '⏳' : '📅'} {e.expira_label}
                  </span>
                </div>
              </div>
            )
          })}
          <div style={{ height: 20 }} />
        </div>
      </div>
    </>
  )
}

// ── Componente principal ──────────────────────────────────────
export default function FueraCartaPill({ restauranteId }: { restauranteId: string }) {
  const [especiales, setEspeciales] = useState<Especial[]>([])
  const [drawer, setDrawer]         = useState(false)
  const [visto, setVisto]           = useState(false)

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('v_fuera_carta_disponibles')
      .select('id, nombre, precio, descripcion, categoria, alergenos, expira_label, horas_restantes')
      .eq('local_id', restauranteId)
    setEspeciales(data ?? [])
  }, [restauranteId])

  useEffect(() => { cargar() }, [cargar])

  // Refresco cada 5 minutos
  useEffect(() => {
    const t = setInterval(cargar, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [cargar])

  if (especiales.length === 0) return null

  return (
    <>
      <div style={{ background: '#14110E', padding: '8px 12px', borderBottom: '1px solid #2C2520', flexShrink: 0 }}>
        <button
          onClick={() => { setDrawer(true); setVisto(true) }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#D9442B',
            boxShadow: visto ? 'none' : '0 0 0 2px #D9442B55',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {!visto && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F6F1E7', display: 'inline-block', animation: 'pillPing 1.4s ease-in-out infinite' }} />}
            <span style={{ color: '#F6F1E7', fontSize: 13, fontWeight: 600 }}>
              ✦ {especiales.length === 1 ? `Especial: ${especiales[0].nombre}` : `${especiales.length} especiales fuera de carta`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {especiales.length === 1 && <span style={{ color: '#F6F1E7', fontFamily: 'monospace', fontSize: 13, opacity: 0.8 }}>{Number(especiales[0].precio).toFixed(2)} €</span>}
            <span style={{ color: '#F6F1E7', fontSize: 11, opacity: 0.7 }}>Ver →</span>
          </div>
        </button>
      </div>

      {drawer && <EspecialesDrawer especiales={especiales} onCerrar={() => setDrawer(false)} />}
    </>
  )
}
