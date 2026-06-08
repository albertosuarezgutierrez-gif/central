'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Lead = {
  id: string; tipo_evento: string; fecha_tentativa: string | null
  num_comensales: number | null; presupuesto_orientativo: number | null
  nombre_contacto: string; telefono: string | null; email: string | null
  espacio_preferido: string | null; como_conocio: string; mensaje: string | null
  estado: string; created_at: string; evento_id: string | null
}

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  nuevo:             { label: 'Nuevo',           color: '#3F7D44' },
  contactado:        { label: 'Contactado',       color: '#2B6A6E' },
  propuesta_enviada: { label: 'Propuesta',        color: '#E8A33B' },
  confirmado:        { label: 'Confirmado ✓',     color: '#3F7D44' },
  perdido:           { label: 'Perdido',          color: '#9CA3AF' },
}

const TIPO_ICONO: Record<string, string> = { boda: '💍', comunion: '✝️', empresa: '💼', cumpleanos: '🎂', graduacion: '🎓', otro: '🎉' }
const fmtEur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function LeadsEventosTab({ sh, restauranteId }: { sh: () => Record<string, string>; restauranteId: string }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('todos')
  const [detalle, setDetalle] = useState<Lead | null>(null)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/eventos-catering/lead?restaurante_id=${restauranteId}`, { headers: sh() })
    const d = await r.json()
    setLeads(d.leads ?? [])
    setLoading(false)
  }, [restauranteId, sh])

  useEffect(() => { cargar() }, [cargar])

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch('/api/eventos-catering/lead', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ id, estado }),
    })
    cargar()
  }

  const filtrados = filtro === 'todos' ? leads : leads.filter(l => l.estado === filtro)
  const nuevos = leads.filter(l => l.estado === 'nuevo').length

  const enlaceFormulario = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.iarest.es'}/catering/${restauranteId}`
  const [copiado, setCopiado] = useState(false)

  const copiarEnlace = () => {
    navigator.clipboard.writeText(enlaceFormulario).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) })
  }

  if (loading) return <div style={{ padding: 24, color: C.ink3, fontFamily: SN }}>Cargando…</div>

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, fontStyle: 'italic', color: C.ink }}>
          Leads de eventos {nuevos > 0 && <span style={{ fontSize: 13, background: C.red + '22', color: C.red, borderRadius: 99, padding: '2px 8px', fontStyle: 'normal', verticalAlign: 'middle' }}>{nuevos} nuevos</span>}
        </div>
        <button onClick={copiarEnlace} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid #2B6A6E`, background: '#2B6A6E15', color: '#2B6A6E', fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>
          {copiado ? '✓ Enlace copiado' : '🔗 Copiar formulario'}
        </button>
      </div>

      {/* Info formulario */}
      <div style={{ background: '#2B6A6E15', border: `1px solid #2B6A6E33`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontFamily: SN, fontSize: 12, color: '#2B6A6E' }}>
        📋 Los clientes pueden solicitar eventos en <strong>/catering/{restauranteId}</strong> — comparte el enlace en tu web, Instagram o WhatsApp.
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[['todos', 'Todos'], ...Object.entries(ESTADO_CONFIG).map(([k, v]) => [k, v.label])].map(([val, label]) => (
          <button key={val} onClick={() => setFiltro(val)}
            style={{ padding: '4px 10px', borderRadius: 5, border: `1px solid ${filtro === val ? C.red : C.rule}`, background: filtro === val ? C.red + '15' : 'transparent', color: filtro === val ? C.red : C.ink3, fontFamily: SN, fontSize: 12, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '32px', textAlign: 'center', color: C.ink3, fontFamily: SN }}>Sin leads.</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {filtrados.map(l => {
          const ec = ESTADO_CONFIG[l.estado] ?? { label: l.estado, color: C.ink3 }
          return (
            <div key={l.id} style={{ background: C.paper, border: `1px solid ${l.estado === 'nuevo' ? C.green : C.rule}`, borderRadius: 8, padding: '12px 14px', cursor: 'pointer' }}
              onClick={() => setDetalle(detalle?.id === l.id ? null : l)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 14 }}>{TIPO_ICONO[l.tipo_evento] ?? '🎉'}</span>
                    <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink }}>{l.nombre_contacto}</span>
                    <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>{l.tipo_evento}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {l.fecha_tentativa && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>📅 {new Date(l.fecha_tentativa).toLocaleDateString('es-ES')}</span>}
                    {l.num_comensales && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>👥 {l.num_comensales}</span>}
                    {l.presupuesto_orientativo && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink2 }}>💰 {fmtEur(l.presupuesto_orientativo)}</span>}
                    {l.telefono && <span style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{l.telefono}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ fontFamily: SN, fontSize: 11, padding: '2px 7px', borderRadius: 99, background: ec.color + '22', color: ec.color }}>{ec.label}</span>
                  <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>{new Date(l.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                </div>
              </div>

              {detalle?.id === l.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.rule}` }}>
                  {l.email && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, marginBottom: 4 }}>✉ {l.email}</div>}
                  {l.espacio_preferido && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, marginBottom: 4 }}>📍 {l.espacio_preferido}</div>}
                  {l.mensaje && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, marginBottom: 8, whiteSpace: 'pre-wrap' }}>"{l.mensaje}"</div>}
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginBottom: 8 }}>Cómo conoció: {l.como_conocio}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {l.telefono && (
                      <a href={`tel:${l.telefono}`} style={{ padding: '5px 12px', borderRadius: 5, border: 'none', background: C.red + '22', color: C.red, fontFamily: SN, fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                        📞 Llamar
                      </a>
                    )}
                    {l.email && (
                      <a href={`mailto:${l.email}`} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', color: C.ink2, fontFamily: SN, fontSize: 12, textDecoration: 'none' }}>
                        ✉ Email
                      </a>
                    )}
                    {Object.entries(ESTADO_CONFIG).filter(([k]) => k !== l.estado).map(([k, v]) => (
                      <button key={k} onClick={e => { e.stopPropagation(); cambiarEstado(l.id, k) }}
                        style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${v.color}44`, background: v.color + '15', color: v.color, fontFamily: SN, fontSize: 11, cursor: 'pointer' }}>
                        → {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
