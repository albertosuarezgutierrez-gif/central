'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { C, SE, SN } from '@/lib/colors'

type Evento = {
  id: string; numero_evento: string; tipo: string; estado: string
  fecha_evento: string; hora_inicio: string | null
  cliente_nombre: string; aforo_previsto: number
  precio_total: number | null; restaurante_nombre?: string
  espacios_evento: { nombre: string } | null
}

const ESTADO_COLOR: Record<string, string> = {
  presupuesto: '#E8A33B', confirmado: '#3F7D44', en_curso: '#D9442B',
  completado: '#6B7280', facturado: '#2B6A6E', cancelado: '#D1D5DB',
}
const TIPO_ICON: Record<string, string> = { boda:'💍', comunion:'⛪', bautizo:'👶', cumpleanos:'🎂', empresa:'🏢', otro:'📅' }

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_SEMANA = ['L','M','X','J','V','S','D']

export default function CalendarioEventosTab({ sh, restauranteId }: { sh: () => Record<string, string>; restauranteId: string }) {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth())
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [selEvento, setSelEvento] = useState<Evento | null>(null)
  const [modo, setModo] = useState<'mes' | 'lista'>('lista')

  const cargar = useCallback(async () => {
    setLoading(true)
    const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(anio, mes + 1, 0).getDate()
    const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${ultimoDia}`
    const r = await fetch(`/api/owner/eventos?desde=${desde}&hasta=${hasta}&modo=grupo`, { headers: sh() })
    const d = await r.json()
    setEventos(d.eventos ?? [])
    setLoading(false)
  }, [anio, mes, sh])

  useEffect(() => { cargar() }, [cargar])

  const eventosPorDia = eventos.reduce((acc: Record<number, Evento[]>, ev) => {
    const dia = new Date(ev.fecha_evento + 'T12:00:00').getDate()
    if (!acc[dia]) acc[dia] = []
    acc[dia].push(ev)
    return acc
  }, {})

  // Construir grid del mes
  const primerDia = new Date(anio, mes, 1)
  const lunesInicio = (primerDia.getDay() + 6) % 7 // 0=lunes
  const diasMes = new Date(anio, mes + 1, 0).getDate()
  const celdas: (number | null)[] = [...Array(lunesInicio).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)]
  // Completar a múltiplo de 7
  while (celdas.length % 7 !== 0) celdas.push(null)

  const navMes = (d: number) => {
    let m = mes + d; let a = anio
    if (m > 11) { m = 0; a++ }
    if (m < 0) { m = 11; a-- }
    setMes(m); setAnio(a)
  }

  const ingrPrev = eventos.filter(e => ['confirmado','en_curso'].includes(e.estado)).reduce((s, e) => s + (e.precio_total ?? 0), 0)

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: SE, fontSize: 18, fontWeight: 700, fontStyle: 'italic', color: C.ink }}>Calendario de eventos</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
            {eventos.length} eventos · {ingrPrev.toLocaleString('es-ES')} € confirmados
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setModo(m => m === 'mes' ? 'lista' : 'mes')}
            style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink2, cursor: 'pointer' }}>
            {modo === 'mes' ? '≡ Lista' : '⊞ Mes'}
          </button>
          <button onClick={() => navMes(-1)} style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>←</button>
          <span style={{ fontFamily: SE, fontSize: 15, fontWeight: 600, minWidth: 110, textAlign: 'center' }}>{MESES[mes]} {anio}</span>
          <button onClick={() => navMes(1)} style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 13, cursor: 'pointer' }}>→</button>
          <button onClick={() => { setMes(hoy.getMonth()); setAnio(hoy.getFullYear()) }}
            style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.rule}`, background: 'transparent', fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer' }}>Hoy</button>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', color: C.ink3, fontFamily: SN, padding: 24 }}>Cargando…</div>}

      {!loading && modo === 'mes' && (
        <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
          {/* Cabecera días */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.rule}` }}>
            {DIAS_SEMANA.map(d => (
              <div key={d} style={{ padding: '6px 0', textAlign: 'center', fontFamily: SN, fontSize: 11, color: C.ink3, fontWeight: 700 }}>{d}</div>
            ))}
          </div>
          {/* Semanas */}
          {Array.from({ length: celdas.length / 7 }, (_, semIdx) => (
            <div key={semIdx} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: semIdx < celdas.length / 7 - 1 ? `1px solid ${C.rule}` : 'none' }}>
              {celdas.slice(semIdx * 7, (semIdx + 1) * 7).map((dia, dIdx) => {
                const esHoy = dia === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear()
                const evsDia = dia ? (eventosPorDia[dia] ?? []) : []
                return (
                  <div key={dIdx} style={{
                    minHeight: 72, padding: '4px 5px', borderLeft: dIdx > 0 ? `1px solid ${C.rule}` : 'none',
                    background: esHoy ? '#EFF6FF' : '#fff',
                  }}>
                    {dia && (
                      <>
                        <div style={{ fontFamily: SN, fontSize: 11, color: esHoy ? '#2563EB' : C.ink3, fontWeight: esHoy ? 700 : 400, marginBottom: 2, textAlign: 'right' }}>{dia}</div>
                        {evsDia.slice(0, 2).map(ev => (
                          <div key={ev.id} onClick={() => setSelEvento(ev)}
                            style={{ fontSize: 10, fontFamily: SN, padding: '2px 4px', borderRadius: 3, marginBottom: 2, background: ESTADO_COLOR[ev.estado] + '22', color: ESTADO_COLOR[ev.estado], cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {TIPO_ICON[ev.tipo]} {ev.cliente_nombre}
                          </div>
                        ))}
                        {evsDia.length > 2 && <div style={{ fontSize: 10, fontFamily: SN, color: C.ink3, textAlign: 'center' }}>+{evsDia.length - 2}</div>}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {!loading && modo === 'lista' && (
        <div style={{ display: 'grid', gap: 6 }}>
          {eventos.length === 0 && <div style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 24, textAlign: 'center', color: C.ink3, fontFamily: SN }}>Sin eventos este mes</div>}
          {eventos.map(ev => (
            <div key={ev.id} onClick={() => setSelEvento(selEvento?.id === ev.id ? null : ev)}
              style={{ background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 14 }}>{TIPO_ICON[ev.tipo] ?? '📅'}</span>
                    <span style={{ fontFamily: SN, fontSize: 13, fontWeight: 600 }}>{ev.cliente_nombre}</span>
                    <span style={{ fontFamily: SN, fontSize: 11, padding: '1px 7px', borderRadius: 99, background: ESTADO_COLOR[ev.estado] + '22', color: ESTADO_COLOR[ev.estado] }}>{ev.estado.replace('_',' ')}</span>
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                    {new Date(ev.fecha_evento + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {ev.hora_inicio ? ` · ${ev.hora_inicio.slice(0,5)}` : ''}
                    {ev.espacios_evento ? ` · ${ev.espacios_evento.nombre}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SE, fontSize: 14, fontWeight: 700 }}>
                    {ev.precio_total ? ev.precio_total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—'}
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>👥 {ev.aforo_previsto}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal detalle evento */}
      {selEvento && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', border: `2px solid ${C.rule}`, borderRadius: '16px 16px 0 0', padding: '16px 20px', zIndex: 100, boxShadow: '0 -4px 24px rgba(0,0,0,.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: SE, fontSize: 15, fontWeight: 700 }}>{TIPO_ICON[selEvento.tipo]} {selEvento.cliente_nombre}</div>
              <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>
                {new Date(selEvento.fecha_evento + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                {selEvento.hora_inicio ? ` · ${selEvento.hora_inicio.slice(0,5)}` : ''}
              </div>
            </div>
            <button onClick={() => setSelEvento(null)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: C.ink3 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Chip label={`👥 ${selEvento.aforo_previsto} comensales`} />
            <Chip label={`${selEvento.estado.replace('_',' ')}`} color={ESTADO_COLOR[selEvento.estado]} />
            {selEvento.precio_total && <Chip label={selEvento.precio_total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })} />}
            {selEvento.espacios_evento && <Chip label={`📍 ${selEvento.espacios_evento.nombre}`} />}
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <div style={{ fontFamily: SN, fontSize: 12, padding: '3px 8px', borderRadius: 6, background: (color ?? '#6B7280') + '18', color: color ?? C.ink2 }}>
      {label}
    </div>
  )
}
