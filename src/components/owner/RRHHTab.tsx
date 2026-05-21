'use client'
import { C, SE, SN, SM } from '@/lib/colors'
import React, { useState, useEffect, useCallback } from 'react'

const TT = SE  // serif italic

// ── Tipos ─────────────────────────────────────────────────────────────────
interface Candidato {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  rol_solicitado: string
  estado: string
  notas_internas: string | null
  fecha_subida: string
  score: number | null
  experiencia_anos: number | null
  idiomas: { idioma: string; nivel: string }[]
  puntos_fuertes: string[]
  puntos_debiles: string[]
  alerta: string | null
  recomendacion: string | null
  resumen: string | null
}

const ROLES = [
  { v: 'camarero',        l: 'Camarero/a' },
  { v: 'jefe_sala',       l: 'Jefe de sala' },
  { v: 'cocina',          l: 'Cocinero/a' },
  { v: 'ayudante_cocina', l: 'Ayudante cocina' },
  { v: 'running',         l: 'Runner' },
  { v: 'barra',           l: 'Barman / Barmaid' },
  { v: 'limpieza',        l: 'Limpieza' },
  { v: 'encargado',       l: 'Encargado/a' },
  { v: 'otro',            l: 'Otro' },
]

const ESTADOS = [
  { v: 'activo',     l: 'Activo',      color: C.amber },
  { v: 'entrevista', l: 'Entrevista',  color: '#5B8DD9' },
  { v: 'contratado', l: 'Contratado',  color: C.green },
  { v: 'descartado', l: 'Descartado',  color: C.ink4 },
]

const RECOM_COLOR: Record<string, string> = {
  contratar:          C.green,
  segunda_entrevista: C.amber,
  descartar:          C.red,
}
const RECOM_LABEL: Record<string, string> = {
  contratar:          'Contratar',
  segunda_entrevista: '2ª entrevista',
  descartar:          'Descartar',
}

function scoreColor(s: number) {
  if (s >= 75) return C.green
  if (s >= 50) return C.amber
  return C.red
}
function rolLabel(v: string) {
  return ROLES.find(r => r.v === v)?.l ?? v
}

// ── Estilos compartidos ───────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  background:   C.bg2,
  border:       `1px solid ${C.rule}`,
  borderRadius: 6,
  color:        C.ink,
  fontFamily:   SM,
  fontSize:     14,
  padding:      '10px 12px',
  width:        '100%',
  boxSizing:    'border-box',
  outline:      'none',
}
const labelStyle: React.CSSProperties = {
  display:       'flex',
  flexDirection: 'column',
  gap:           6,
}
const labelTxt: React.CSSProperties = {
  fontFamily:    SM,
  fontSize:      11,
  fontWeight:    700,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color:         C.ink3,
}
const secTitleStyle: React.CSSProperties = {
  fontFamily:    SM,
  fontSize:      10,
  fontWeight:    700,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color:         C.ink4,
  marginBottom:  8,
}

// ── Chip badge ────────────────────────────────────────────────────────────
function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily:    SM,
      fontSize:      11,
      fontWeight:    600,
      letterSpacing: '.06em',
      background:    color + '18',
      color,
      padding:       '3px 9px',
      borderRadius:  999,
      border:        `1px solid ${color}44`,
      whiteSpace:    'nowrap',
      display:       'inline-block',
    }}>{children}</span>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Sub-componente DetalleView (hooks separados para no violar reglas)
// ══════════════════════════════════════════════════════════════════════════
function DetalleView({
  candidato: c,
  sh,
  onBack,
  onEstadoChange,
  onEliminar,
}: {
  candidato: Candidato
  sh: () => Record<string, string>
  onBack: () => void
  onEstadoChange: (id: string, estado: string) => Promise<void>
  onEliminar: (id: string) => Promise<void>
}) {
  const [nota, setNota]                = useState(c.notas_internas ?? '')
  const [notaGuardada, setNotaGuardada] = useState(false)

  async function guardarNota() {
    await fetch(`/api/rrhh/candidatos/${c.id}`, {
      method:  'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notas_internas: nota }),
    })
    setNotaGuardada(true)
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: C.ink3,
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
        }}>&#8592;</button>
        <div>
          <h2 style={{ fontFamily: TT, fontSize: 22, color: C.ink, margin: 0, fontStyle: 'italic' }}>
            {c.nombre}
          </h2>
          <div style={{ fontFamily: SM, fontSize: 12, color: C.ink3, marginTop: 2 }}>
            {rolLabel(c.rol_solicitado)} &middot; {new Date(c.fecha_subida).toLocaleDateString('es-ES')}
          </div>
        </div>
      </div>

      {/* Score + recomendacion */}
      {c.score != null && (
        <div style={{
          background: C.card, border: `1px solid ${C.rule}`, borderRadius: 10,
          padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ textAlign: 'center', minWidth: 64 }}>
            <div style={{
              fontFamily: TT, fontSize: 44, fontWeight: 700, fontStyle: 'italic',
              color: scoreColor(c.score), lineHeight: 1,
            }}>{c.score}</div>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4,
              textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 4 }}>Score</div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {c.recomendacion && (
              <div style={{ marginBottom: 8 }}>
                <Chip color={RECOM_COLOR[c.recomendacion]}>
                  {RECOM_LABEL[c.recomendacion] ?? c.recomendacion}
                </Chip>
              </div>
            )}
            {c.resumen && (
              <p style={{ fontFamily: SN, fontSize: 13, color: C.ink2, margin: 0, lineHeight: 1.6 }}>
                {c.resumen}
              </p>
            )}
          </div>
          {c.experiencia_anos != null && (
            <div style={{ textAlign: 'center', minWidth: 48 }}>
              <div style={{ fontFamily: TT, fontSize: 28, color: C.ink2, fontStyle: 'italic' }}>
                {c.experiencia_anos}
              </div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4,
                textTransform: 'uppercase', letterSpacing: '.1em' }}>Anos</div>
            </div>
          )}
        </div>
      )}

      {/* Alerta */}
      {c.alerta && (
        <div style={{
          background: C.amberS, border: `1px solid ${C.amber}44`, borderRadius: 8,
          padding: '10px 14px', marginBottom: 16,
          fontFamily: SN, fontSize: 13, color: C.amberD,
        }}>&#9888; {c.alerta}</div>
      )}

      {/* Idiomas */}
      {c.idiomas?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={secTitleStyle}>Idiomas</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {c.idiomas.map((lang, i) => (
              <span key={i} style={{
                background: C.paper2, border: `1px solid ${C.rule}`,
                borderRadius: 999, padding: '4px 10px',
                fontFamily: SM, fontSize: 12, color: C.ink2,
              }}>{lang.idioma} &mdash; {lang.nivel}</span>
            ))}
          </div>
        </div>
      )}

      {/* Puntos fuertes / debiles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {c.puntos_fuertes?.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 14 }}>
            <div style={{ ...secTitleStyle, color: C.green, marginBottom: 10 }}>&#10003; Puntos fuertes</div>
            {c.puntos_fuertes.map((p, i) => (
              <div key={i} style={{ fontFamily: SN, fontSize: 12, color: C.ink2,
                marginBottom: 6, paddingLeft: 10, borderLeft: `2px solid ${C.green}` }}>{p}</div>
            ))}
          </div>
        )}
        {c.puntos_debiles?.length > 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.rule}`, borderRadius: 8, padding: 14 }}>
            <div style={{ ...secTitleStyle, color: C.amber, marginBottom: 10 }}>&#9651; A valorar</div>
            {c.puntos_debiles.map((p, i) => (
              <div key={i} style={{ fontFamily: SN, fontSize: 12, color: C.ink2,
                marginBottom: 6, paddingLeft: 10, borderLeft: `2px solid ${C.amber}` }}>{p}</div>
            ))}
          </div>
        )}
      </div>

      {/* Estado */}
      <div style={{ marginBottom: 16 }}>
        <div style={secTitleStyle}>Estado</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ESTADOS.map(e => (
            <button key={e.v} onClick={() => onEstadoChange(c.id, e.v)} style={{
              background:   c.estado === e.v ? e.color + '18' : 'transparent',
              border:       `1px solid ${c.estado === e.v ? e.color + '66' : C.rule}`,
              color:        c.estado === e.v ? e.color : C.ink3,
              borderRadius: 6, padding: '6px 14px',
              fontFamily:   SM, fontSize: 12, fontWeight: c.estado === e.v ? 700 : 400,
              cursor:       'pointer', transition: 'all .15s',
            }}>{e.l}</button>
          ))}
        </div>
      </div>

      {/* Notas */}
      <div style={{ marginBottom: 20 }}>
        <div style={secTitleStyle}>Notas internas</div>
        <textarea value={nota}
          onChange={e => { setNota(e.target.value); setNotaGuardada(false) }}
          onBlur={guardarNota}
          placeholder="Observaciones, detalles de entrevista, pendientes..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: SN, lineHeight: 1.6 }}
        />
        {notaGuardada && (
          <div style={{ fontFamily: SM, fontSize: 11, color: C.green, marginTop: 4 }}>&#10003; Guardado</div>
        )}
      </div>

      {/* Contacto */}
      {(c.email || c.telefono) && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {c.email && (
            <a href={`mailto:${c.email}`} style={{ fontFamily: SM, fontSize: 13, color: C.red, textDecoration: 'none' }}>
              &#9993; {c.email}
            </a>
          )}
          {c.telefono && (
            <a href={`tel:${c.telefono}`} style={{ fontFamily: SM, fontSize: 13, color: C.red, textDecoration: 'none' }}>
              &#9743; {c.telefono}
            </a>
          )}
        </div>
      )}

      {/* Eliminar */}
      <button onClick={() => onEliminar(c.id)} style={{
        background: 'none', border: `1px solid ${C.rule}`,
        color: C.ink4, borderRadius: 6, padding: '8px 16px',
        fontFamily: SM, fontSize: 12, cursor: 'pointer',
      }}>Eliminar candidato</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// Componente principal RRHHTab
// ══════════════════════════════════════════════════════════════════════════
export default function RRHHTab({ sh }: { sh: () => Record<string, string> }) {
  const [candidatos,   setCandidatos]   = useState<Candidato[]>([])
  const [loading,      setLoading]      = useState(true)
  const [vista,        setVista]        = useState<'lista' | 'nuevo' | 'detalle'>('lista')
  const [seleccionado, setSeleccionado] = useState<Candidato | null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroRol,    setFiltroRol]    = useState('')
  const [form, setForm]                 = useState({
    nombre: '', email: '', telefono: '', rol_solicitado: 'camarero', cv_texto: '',
  })
  const [analizando, setAnalizando]     = useState(false)
  const [error, setError]               = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (filtroEstado) p.set('estado', filtroEstado)
      if (filtroRol)    p.set('rol', filtroRol)
      const res  = await fetch(`/api/rrhh/candidatos?${p}`, { headers: sh() })
      const data = await res.json()
      setCandidatos(data.candidatos ?? [])
    } catch { /* silencioso */ }
    setLoading(false)
  }, [filtroEstado, filtroRol, sh])

  useEffect(() => { cargar() }, [cargar])

  async function handleNuevo() {
    if (!form.nombre.trim() || !form.cv_texto.trim()) {
      setError('El nombre y el texto del CV son obligatorios.')
      return
    }
    setAnalizando(true); setError('')
    try {
      const res  = await fetch('/api/rrhh/candidatos', {
        method:  'POST',
        headers: { ...sh(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error'); setAnalizando(false); return }
      setForm({ nombre: '', email: '', telefono: '', rol_solicitado: 'camarero', cv_texto: '' })
      setVista('lista')
      await cargar()
    } catch { setError('Error de red') }
    setAnalizando(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch(`/api/rrhh/candidatos/${id}`, {
      method:  'PATCH',
      headers: { ...sh(), 'Content-Type': 'application/json' },
      body:    JSON.stringify({ estado }),
    })
    await cargar()
    setSeleccionado(prev => prev?.id === id ? { ...prev, estado } : prev)
  }

  async function eliminar(id: string) {
    if (!confirm('Eliminar candidato? Esta accion no se puede deshacer.')) return
    await fetch(`/api/rrhh/candidatos/${id}`, { method: 'DELETE', headers: sh() })
    setVista('lista')
    await cargar()
  }

  // ── Vista: formulario nuevo ───────────────────────────────────────────
  if (vista === 'nuevo') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setVista('lista')} style={{
            background: 'none', border: 'none', color: C.ink3,
            cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
          }}>&#8592;</button>
          <h2 style={{ fontFamily: TT, fontSize: 22, color: C.ink, margin: 0, fontStyle: 'italic' }}>
            Nuevo candidato
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={labelStyle}>
            <span style={labelTxt}>Nombre completo *</span>
            <input value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Maria Garcia Lopez" style={inputStyle} />
          </label>

          <label style={labelStyle}>
            <span style={labelTxt}>Puesto solicitado *</span>
            <select value={form.rol_solicitado}
              onChange={e => setForm(p => ({ ...p, rol_solicitado: e.target.value }))}
              style={{ ...inputStyle, appearance: 'none' }}>
              {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              <span style={labelTxt}>Email</span>
              <input value={form.email} type="email"
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="candidato@email.com" style={inputStyle} />
            </label>
            <label style={labelStyle}>
              <span style={labelTxt}>Telefono</span>
              <input value={form.telefono}
                onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
                placeholder="6XX XXX XXX" style={inputStyle} />
            </label>
          </div>

          <label style={labelStyle}>
            <span style={labelTxt}>Texto del CV *</span>
            <span style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 4, display: 'block' }}>
              Copia y pega el contenido del CV, o transcribe los datos del candidato.
            </span>
            <textarea value={form.cv_texto}
              onChange={e => setForm(p => ({ ...p, cv_texto: e.target.value }))}
              placeholder="Datos de formacion, experiencia laboral, idiomas, habilidades..."
              rows={10}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: SM, fontSize: 12, lineHeight: 1.6 }}
            />
          </label>

          {error && (
            <div style={{
              background: C.redS, border: `1px solid ${C.red}44`, borderRadius: 6,
              padding: '10px 14px', color: C.redD, fontFamily: SN, fontSize: 13,
            }}>{error}</div>
          )}

          <button onClick={handleNuevo} disabled={analizando} style={{
            background:  analizando ? C.ink4 : C.red,
            color:       '#fff', border: 'none', borderRadius: 8,
            padding:     '14px 0', fontFamily: SM, fontWeight: 700,
            fontSize:    15, cursor: analizando ? 'not-allowed' : 'pointer',
          }}>
            {analizando ? 'Analizando con IA...' : '\u2736 Analizar CV con IA'}
          </button>
        </div>
      </div>
    )
  }

  // ── Vista: detalle ────────────────────────────────────────────────────
  if (vista === 'detalle' && seleccionado) {
    return (
      <DetalleView
        candidato={seleccionado}
        sh={sh}
        onBack={() => setVista('lista')}
        onEstadoChange={cambiarEstado}
        onEliminar={eliminar}
      />
    )
  }

  // ── Vista: lista ──────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: TT, fontSize: 22, color: C.ink, margin: 0, fontStyle: 'italic' }}>
          Candidatos
        </h2>
        <button onClick={() => setVista('nuevo')} style={{
          background: C.red, color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 18px', fontFamily: SM, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          + Nuevo candidato
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          style={{ ...inputStyle, maxWidth: 160, padding: '8px 12px' }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
        </select>
        <select value={filtroRol} onChange={e => setFiltroRol(e.target.value)}
          style={{ ...inputStyle, maxWidth: 180, padding: '8px 12px' }}>
          <option value="">Todos los roles</option>
          {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: C.ink4, fontFamily: SM, fontSize: 13, textAlign: 'center', padding: 40 }}>
          Cargando...
        </div>
      ) : candidatos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: C.ink4 }}>
          <div style={{ fontFamily: TT, fontSize: 32, fontStyle: 'italic', marginBottom: 12 }}>
            Sin candidatos
          </div>
          <div style={{ fontFamily: SN, fontSize: 13 }}>
            Pulsa &quot;+ Nuevo candidato&quot; para anadir el primer CV.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidatos.map(c => {
            const estadoInfo = ESTADOS.find(e => e.v === c.estado)
            return (
              <div key={c.id}
                onClick={() => { setSeleccionado(c); setVista('detalle') }}
                style={{
                  background:   C.card,
                  border:       `1px solid ${C.rule}`,
                  borderRadius: 10,
                  padding:      '13px 16px',
                  cursor:       'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          14,
                  transition:   'border-color .15s, box-shadow .15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.ink3
                  e.currentTarget.style.boxShadow   = '0 2px 8px rgba(26,23,20,.07)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.rule
                  e.currentTarget.style.boxShadow   = 'none'
                }}
              >
                {/* Score badge */}
                <div style={{
                  minWidth:   46,
                  height:     46,
                  borderRadius: 8,
                  background: c.score != null ? scoreColor(c.score) + '12' : C.paper2,
                  border:     `1px solid ${c.score != null ? scoreColor(c.score) + '55' : C.rule}`,
                  display:    'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <div style={{
                    fontFamily: TT, fontSize: 17, fontWeight: 700, fontStyle: 'italic',
                    color: c.score != null ? scoreColor(c.score) : C.ink4, lineHeight: 1,
                  }}>{c.score ?? '\u2014'}</div>
                  <div style={{ fontFamily: SM, fontSize: 8, color: C.ink4,
                    letterSpacing: '.08em', textTransform: 'uppercase', marginTop: 1 }}>score</div>
                </div>

                {/* Info principal */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SM, fontSize: 14, fontWeight: 600, color: C.ink,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.nombre}
                  </div>
                  <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 2 }}>
                    {rolLabel(c.rol_solicitado)}
                    {c.experiencia_anos != null && ` \u00b7 ${c.experiencia_anos}a exp.`}
                    {c.idiomas?.length > 0 && ` \u00b7 ${c.idiomas.map(l => l.idioma).join(', ')}`}
                  </div>
                </div>

                {/* Chips derecha */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {c.recomendacion && (
                    <Chip color={RECOM_COLOR[c.recomendacion]}>
                      {RECOM_LABEL[c.recomendacion]}
                    </Chip>
                  )}
                  {estadoInfo && (
                    <Chip color={estadoInfo.color}>{estadoInfo.l}</Chip>
                  )}
                  {c.alerta && (
                    <span style={{ color: C.amber, fontSize: 14 }}>&#9888;</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
