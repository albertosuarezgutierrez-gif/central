'use client'
import { C, SE, SN, SM } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'

interface Fichaje {
  id: string
  nombre: string
  fecha: string
  estado: 'activo' | 'cerrado'
  entrada_at: string
  salida_at:  string | null
  horas_totales: number | null
  tipo: string
  notas: string | null
  camarero_id: string
  camareros: { nombre: string; rol: string }
}

interface Activo {
  id: string
  camarero_id: string
  entrada_at: string
  camareros: { nombre: string; rol: string }
}

export default function FichajesTab() {
  const sh = () => ({ 'x-ia-session': localStorage.getItem('ia_rest_session') ?? '' })

  const hoy   = new Date().toISOString().split('T')[0]
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]

  const [desde,    setDesde]    = useState(hace7)
  const [hasta,    setHasta]    = useState(hoy)
  const [fichajes, setFichajes] = useState<Fichaje[]>([])
  const [activos,  setActivos]  = useState<Activo[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editando, setEditando] = useState<string | null>(null)
  const [nota,     setNota]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/turnos/historial?desde=${desde}&hasta=${hasta}`, { headers: sh() })
    const d = await r.json()
    setFichajes(d.fichajes ?? [])
    setActivos(d.activos ?? [])
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { load() }, [load])

  const guardarNota = async (id: string) => {
    await fetch('/api/turnos/historial', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...sh() },
      body: JSON.stringify({ turno_id: id, notas: nota }),
    })
    setEditando(null)
    await load()
  }

  const fmtHora  = (iso: string) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const fmtFecha = (d: string)   => new Date(d + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
  const fmtHoras = (h: number | null) => {
    if (h === null) return '\u2014'
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    return `${hh}h ${mm.toString().padStart(2, '0')}m`
  }

  const rolBadge: Record<string, string> = {
    camarero: 'CAM', cocina: 'COC', jefe_sala: 'JEFE', running: 'RUN', owner: 'OWN',
  }

  const porFecha: Record<string, Fichaje[]> = {}
  for (const f of fichajes) {
    if (!porFecha[f.fecha]) porFecha[f.fecha] = []
    porFecha[f.fecha].push(f)
  }

  const totalHoras = fichajes
    .filter(f => f.horas_totales)
    .reduce((s, f) => s + (f.horas_totales ?? 0), 0)

  const exportCSV = () => {
    const rows = [
      ['Fecha','Nombre','Rol','Entrada','Salida','Horas','Tipo','Notas'],
      ...fichajes.map(f => [
        f.fecha,
        f.camareros?.nombre ?? f.nombre,
        f.camareros?.rol ?? '',
        fmtHora(f.entrada_at),
        f.salida_at ? fmtHora(f.salida_at) : '',
        f.horas_totales?.toString() ?? '',
        f.tipo,
        f.notas ?? '',
      ])
    ]
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `fichajes_${desde}_${hasta}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', color: C.ink4, textTransform: 'uppercase' }}>
          Auditoria
        </div>
        <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: C.ink, marginTop: 2 }}>
          Registro de jornada
        </div>
        <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, marginTop: 4 }}>
          Control de fichajes &middot; RD-ley 8/2019
        </div>
      </div>

      {/* Trabajando ahora */}
      {activos.length > 0 && (
        <div style={{ background: C.greenS, border: `1px solid ${C.green}33`, borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.green, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Trabajando ahora &mdash; {activos.length} persona{activos.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activos.map(a => {
              const mins = Math.floor((Date.now() - new Date(a.entrada_at).getTime()) / 60000)
              const dur  = mins < 60 ? `${mins}min` : `${Math.floor(mins / 60)}h${mins % 60}m`
              return (
                <div key={a.id} style={{ background: C.bone, border: `1px solid ${C.green}44`, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                  <div>
                    <div style={{ fontFamily: SN, fontSize: 13, color: C.ink }}>{a.camareros?.nombre}</div>
                    <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>desde {fmtHora(a.entrada_at)} &middot; {dur}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            style={{ fontFamily: SM, fontSize: 12, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '6px 8px', color: C.ink, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>Hasta</label>
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
            style={{ fontFamily: SM, fontSize: 12, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '6px 8px', color: C.ink, outline: 'none' }} />
        </div>
        <button onClick={exportCSV} style={{ marginLeft: 'auto', padding: '7px 14px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 8, fontFamily: SN, fontSize: 12, color: C.ink3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Exportar CSV
        </button>
      </div>

      {/* Resumen del periodo */}
      {!loading && fichajes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'Fichajes',      val: fichajes.length.toString() },
            { label: 'Horas totales', val: fmtHoras(totalHoras) },
            { label: 'Trabajadores',  val: [...new Set(fichajes.map(f => f.camarero_id))].length.toString() },
          ].map(({ label, val }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, textTransform: 'uppercase', letterSpacing: '.1em' }}>{label}</div>
              <div style={{ fontFamily: SE, fontSize: 22, color: C.ink, fontStyle: 'italic', marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: SM, fontSize: 11, color: C.ink4 }}>Cargando...</div>
      )}

      {!loading && fichajes.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, background: C.card, borderRadius: 12, border: `1px solid ${C.rule}` }}>
          <div style={{ fontFamily: SE, fontSize: 20, color: C.ink4, fontStyle: 'italic' }}>Sin fichajes en este periodo</div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4, marginTop: 8 }}>Los trabajadores ficharan al entrar con su PIN</div>
        </div>
      )}

      {Object.entries(porFecha)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([fecha, rows]) => {
          const horasDia = rows.filter(r => r.horas_totales).reduce((s, r) => s + (r.horas_totales ?? 0), 0)
          return (
            <div key={fecha} style={{ marginBottom: 20 }}>
              {/* Cabecera fecha */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink3 }}>{fmtFecha(fecha)}</div>
                {horasDia > 0 && <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4 }}>{fmtHoras(horasDia)} total dia</div>}
              </div>

              {/* Fichajes del dia */}
              <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
                {rows.map((f, i) => (
                  <div key={f.id} style={{ borderTop: i > 0 ? `1px solid ${C.rule}` : 'none', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Badge rol */}
                      <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, color: C.ink3, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 4, padding: '2px 5px', minWidth: 34, textAlign: 'center' }}>
                        {rolBadge[f.camareros?.rol] ?? '?'}
                      </div>

                      {/* Nombre */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.camareros?.nombre ?? f.nombre}
                        </div>
                        {f.notas && editando !== f.id && (
                          <div style={{ fontFamily: SN, fontSize: 11, color: C.amber, marginTop: 2 }}>{f.notas}</div>
                        )}
                      </div>

                      {/* Horas */}
                      <div style={{ textAlign: 'right', minWidth: 90 }}>
                        <div style={{ fontFamily: SM, fontSize: 12, color: C.ink }}>
                          {fmtHora(f.entrada_at)} &rarr; {f.salida_at ? fmtHora(f.salida_at) : (
                            <span style={{ color: C.green }}>activo</span>
                          )}
                        </div>
                        <div style={{ fontFamily: SM, fontSize: 11, color: f.horas_totales ? C.ink3 : C.green, marginTop: 1 }}>
                          {f.horas_totales ? fmtHoras(f.horas_totales) : '\u21bb en curso'}
                        </div>
                      </div>

                      {/* Boton nota */}
                      <button
                        onClick={() => { setEditando(editando === f.id ? null : f.id); setNota(f.notas ?? '') }}
                        title="Anadir nota"
                        style={{ padding: '4px 6px', background: 'transparent', border: `1px solid ${C.rule}`, borderRadius: 6, cursor: 'pointer', color: C.ink4 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                    </div>

                    {/* Editor nota */}
                    {editando === f.id && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <input
                          value={nota}
                          onChange={e => setNota(e.target.value)}
                          placeholder="Nota para Inspeccion (ej: turno partido, descanso no computable...)"
                          style={{ flex: 1, fontFamily: SN, fontSize: 12, background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '7px 10px', color: C.ink, outline: 'none' }}
                        />
                        <button onClick={() => guardarNota(f.id)} style={{ padding: '7px 12px', background: C.red, border: 'none', borderRadius: 6, fontFamily: SN, fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>Guardar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}
