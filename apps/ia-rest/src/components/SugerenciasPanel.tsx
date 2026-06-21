'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'

// ─── Tipos ──────────────────────────────────────────────────────
interface Sugerencia {
  id: string
  rol: string
  nombre_usuario: string
  categoria: 'bug' | 'mejora' | 'idea' | 'urgente'
  texto: string
  leida: boolean
  estado: 'nueva' | 'en_revision' | 'resuelta' | 'descartada'
  nota_admin?: string
  created_at: string
  restaurantes?: { nombre: string; ciudad?: string }
}

interface Props {
  sugerencias: Sugerencia[]
  loading: boolean
  filtro: string
  setFiltro: (f: string) => void
  onMarcarLeida: (id: string) => void
  onCambiarEstado: (id: string, estado: string) => void
  onRecargar: () => void
}

// ─── Config ──────────────────────────────────────────────────────

const CAT_CONFIG = {
  bug:     { label: 'Bug',     emoji: '🐛', bg: '#F4D8CF', color: C.red },
  mejora:  { label: 'Mejora',  emoji: '✨', bg: '#D8EFF0', color: '#1A5C60' },
  idea:    { label: 'Idea',    emoji: '💡', bg: C.ambS,   color: '#7A5200' },
  urgente: { label: 'Urgente', emoji: '🚨', bg: '#FFEBEB', color: C.redD },
}

const ESTADO_CONFIG = {
  nueva:       { label: 'Nueva',       color: C.ink3 },
  en_revision: { label: 'En revisión', color: '#1A5C60' },
  resuelta:    { label: 'Resuelta',    color: C.green },
  descartada:  { label: 'Descartada',  color: C.ink4 },
}

const ROL_LABEL: Record<string, string> = {
  super_admin: 'Super Admin', owner: 'Dueño',
  admin: 'Admin', jefe_sala: 'Jefe de sala',
  camarero: 'Camarero', cocina: 'Cocina',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export default function SugerenciasPanel({
  sugerencias, loading, filtro, setFiltro,
  onMarcarLeida, onCambiarEstado, onRecargar,
}: Props) {

  const filtros = [
    { id: 'todas',    label: 'Todas' },
    { id: 'nuevas',   label: 'No leídas' },
    { id: 'bug',      label: '🐛 Bugs' },
    { id: 'urgente',  label: '🚨 Urgentes' },
    { id: 'mejora',   label: '✨ Mejoras' },
    { id: 'idea',     label: '💡 Ideas' },
    { id: 'resuelta', label: '✓ Resueltas' },
  ]

  const lista = sugerencias.filter(s => {
    if (filtro === 'nuevas')   return !s.leida
    if (filtro === 'resuelta') return s.estado === 'resuelta'
    if (['bug','mejora','idea','urgente'].includes(filtro)) return s.categoria === filtro
    return true
  })

  const stats = {
    total:    sugerencias.length,
    noLeidas: sugerencias.filter(s => !s.leida).length,
    bugs:     sugerencias.filter(s => s.categoria === 'bug').length,
    urgentes: sugerencias.filter(s => s.categoria === 'urgente').length,
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: SM, fontSize: 11, color: C.red, letterSpacing: '.12em', marginBottom: 6 }}>
            PANEL · SUPER ADMIN
          </div>
          <h1 style={{ fontFamily: SE, fontSize: 44, fontWeight: 500, margin: '0 0 6px', letterSpacing: '-.02em', color: C.ink }}>
            Sugerencias
          </h1>
          <div style={{ fontFamily: SC, fontSize: 16, color: C.ink3 }}>
            Lo que el equipo necesita que mejores
          </div>
        </div>
        <button
          onClick={onRecargar}
          style={{
            background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4,
            fontFamily: SM, fontSize: 10, color: C.ink3, padding: '8px 14px',
            cursor: 'pointer', letterSpacing: '.08em',
          }}
        >
          ↻ RECARGAR
        </button>
      </div>

      {/* Stats rápidas */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL', val: stats.total, color: C.ink },
          { label: 'NO LEÍDAS', val: stats.noLeidas, color: C.red },
          { label: 'BUGS', val: stats.bugs, color: C.red },
          { label: 'URGENTES', val: stats.urgentes, color: C.redD },
        ].map(s => (
          <div key={s.label} style={{
            background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 6,
            padding: '10px 16px', minWidth: 80,
          }}>
            <div style={{ fontFamily: SE, fontSize: 28, fontWeight: 500, color: s.color, lineHeight: 1 }}>
              {s.val}
            </div>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.ink4, letterSpacing: '.1em', marginTop: 3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {filtros.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: `1px solid ${filtro === f.id ? C.ink : C.rule}`,
              background: filtro === f.id ? C.ink : 'transparent',
              color: filtro === f.id ? C.bg : C.ink3,
              fontFamily: SM, fontSize: 10, letterSpacing: '.06em',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            {f.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: SM, fontSize: 12, color: C.ink4 }}>
          CARGANDO…
        </div>
      ) : lista.length === 0 ? (
        <div style={{
          padding: '48px 32px', textAlign: 'center',
          border: `1px dashed ${C.rule}`, borderRadius: 8,
        }}>
          <div style={{ fontFamily: SC, fontSize: 22, color: C.ink3, marginBottom: 6 }}>
            Nada por aquí
          </div>
          <div style={{ fontFamily: SN, fontSize: 13, color: C.ink4 }}>
            Sin sugerencias con este filtro
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(s => {
            const cat = CAT_CONFIG[s.categoria]
            const est = ESTADO_CONFIG[s.estado]
            return (
              <div
                key={s.id}
                style={{
                  border: `1px solid ${s.leida ? C.rule : C.ruleS}`,
                  borderLeft: `3px solid ${s.leida ? C.rule : cat.color}`,
                  borderRadius: 8,
                  background: s.leida ? C.bg : '#FFFDF8',
                  padding: '16px 20px',
                  opacity: s.estado === 'descartada' ? 0.6 : 1,
                }}
              >
                {/* Row 1: meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  {/* Categoría pill */}
                  <span style={{
                    background: cat.bg, color: cat.color,
                    fontFamily: SM, fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
                    padding: '2px 8px', borderRadius: 10,
                  }}>
                    {cat.emoji} {cat.label.toUpperCase()}
                  </span>

                  {/* No leída */}
                  {!s.leida && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: C.red, display: 'inline-block', flexShrink: 0,
                    }} title="No leída" />
                  )}

                  {/* Nombre + rol */}
                  <span style={{ fontFamily: SM, fontSize: 11, color: C.ink2, fontWeight: 600 }}>
                    {s.nombre_usuario}
                  </span>
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                    {ROL_LABEL[s.rol] ?? s.rol}
                  </span>

                  {/* Restaurante */}
                  {s.restaurantes?.nombre && (
                    <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4 }}>
                      · {s.restaurantes.nombre}
                    </span>
                  )}

                  {/* Tiempo */}
                  <span style={{ fontFamily: SM, fontSize: 10, color: C.ink4, marginLeft: 'auto' }}>
                    {timeAgo(s.created_at)}
                  </span>
                </div>

                {/* Texto */}
                <div style={{ fontFamily: SN, fontSize: 14, color: C.ink, lineHeight: 1.55, marginBottom: 12 }}>
                  {s.texto}
                </div>

                {/* Acciones */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {/* Estado selector */}
                  <select
                    value={s.estado}
                    onChange={e => onCambiarEstado(s.id, e.target.value)}
                    style={{
                      background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 4,
                      fontFamily: SM, fontSize: 10, color: est.color,
                      padding: '4px 8px', cursor: 'pointer', outline: 'none',
                      letterSpacing: '.06em',
                    }}
                  >
                    <option value="nueva">NUEVA</option>
                    <option value="en_revision">EN REVISIÓN</option>
                    <option value="resuelta">RESUELTA</option>
                    <option value="descartada">DESCARTADA</option>
                  </select>

                  {/* Marcar leída */}
                  {!s.leida && (
                    <button
                      onClick={() => onMarcarLeida(s.id)}
                      style={{
                        background: 'none', border: `1px solid ${C.rule}`, borderRadius: 4,
                        fontFamily: SM, fontSize: 10, color: C.ink3, padding: '4px 10px',
                        cursor: 'pointer', letterSpacing: '.06em',
                      }}
                    >
                      MARCAR LEÍDA
                    </button>
                  )}

                  {/* Indicador estado visual */}
                  <span style={{ fontFamily: SC, fontSize: 13, color: est.color, marginLeft: 4 }}>
                    {s.estado === 'resuelta' ? '✓ resuelta' :
                     s.estado === 'en_revision' ? '👀 revisando…' :
                     s.estado === 'descartada' ? 'descartada' : ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Caveat */}
      <div style={{
        marginTop: 48, paddingTop: 20, borderTop: `1px solid ${C.rule}`,
        fontFamily: SC, fontSize: 16, color: C.ink3, textAlign: 'center',
      }}>
        cada sugerencia es una cocina que trabaja mejor
      </div>
    </div>
  )
}
