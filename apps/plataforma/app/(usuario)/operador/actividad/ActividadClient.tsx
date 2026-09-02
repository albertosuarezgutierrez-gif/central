'use client'
import { useEffect, useState } from 'react'
import type { ActorResumen, FilaActividad } from '@/lib/actividad-ialimp'

const TIPO_ICON: Record<string, string> = { owner: '👑', usuario: '🧑‍💼', limpiadora: '🧹', propietario: '🏠' }
const TIPO_LABEL: Record<string, string> = { owner: 'Dueña/o', usuario: 'Usuario', limpiadora: 'Limpiadora', propietario: 'Propietario' }
const ACCION_LABEL: Record<string, string> = { login: '🔑 Login', login_forzado: '🔑 Login (forzado)', pagina: '📄 Página', accion: '✏️ Acción' }

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
}

export default function ActividadClient({ actores, desde, total, empresas }: {
  actores: ActorResumen[]
  desde: string | null
  total: number
  empresas: Array<{ id: string; nombre: string }>
}) {
  const [empresa, setEmpresa] = useState('')
  const [tipo, setTipo] = useState('')
  const [accion, setAccion] = useState('')
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<FilaActividad[]>([])
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)

  async function cargar(offset = 0, append = false) {
    setCargando(true)
    try {
      const p = new URLSearchParams()
      if (empresa) p.set('empresa', empresa)
      if (tipo) p.set('tipo', tipo)
      if (accion) p.set('accion', accion)
      if (q) p.set('q', q)
      if (offset) p.set('offset', String(offset))
      const r = await fetch('/api/admin/actividad?' + p.toString())
      const j = await r.json()
      if (Array.isArray(j.filas)) {
        setFilas(f => append ? [...f, ...j.filas] : j.filas)
        setHayMas(!!j.hayMas)
      }
    } catch { /* la lista se queda como esté */ }
    setCargando(false)
  }

  useEffect(() => { cargar() }, [empresa, tipo, accion]) // eslint-disable-line react-hooks/exhaustive-deps

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid #f1f5f9', whiteSpace: 'nowrap' }
  const select: React.CSSProperties = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, background: 'white' }

  return (
    <div style={{ padding: '24px clamp(16px,4vw,40px)', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>👁️ Actividad ialimp</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
        Accesos y actividad de los usuarios del SaaS (dueña, usuarios, limpiadoras y propietarios). {total} eventos registrados.
      </p>
      <p style={{ fontSize: 12, color: 'var(--warning)', background: 'var(--warning-bg)', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 12px' }}>
        ⚠️ El registro está activo desde {desde ? fmtFecha(desde) : 'el despliegue del 15/08/2026'} — de fechas anteriores no hay
        datos (no significa que no hubiera actividad). El superadmin no se registra.
      </p>

      {/* Último acceso por persona */}
      <section style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, marginTop: 16 }}>
        <div style={{ padding: '12px 16px', fontWeight: 800 }}>Último acceso por persona</div>
        {actores.length === 0 ? (
          <p style={{ padding: '0 16px 16px', color: 'var(--muted)', fontSize: 13 }}>
            Sin actividad registrada todavía (el registro acaba de estrenarse: se irá llenando con cada acceso).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>Quién</th><th style={th}>Empresa</th><th style={th}>Último login</th>
                <th style={th}>Última actividad</th><th style={th}>Eventos</th>
              </tr></thead>
              <tbody>
                {actores.map((a, i) => (
                  <tr key={`${a.actor_tipo}-${a.actor_id ?? i}`}>
                    <td style={td}>{TIPO_ICON[a.actor_tipo] ?? '👤'} <b>{a.actor_nombre ?? '—'}</b>{' '}
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>{TIPO_LABEL[a.actor_tipo] ?? a.actor_tipo}</span></td>
                    <td style={td}>{a.empresa_nombre ?? '—'}</td>
                    <td style={td}>{a.ultimo_login ? fmtFecha(a.ultimo_login) : <span style={{ color: 'var(--muted)' }}>sin login registrado</span>}</td>
                    <td style={td}>{fmtFecha(a.ultima_actividad)}</td>
                    <td style={td}>{a.eventos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historial */}
      <section style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 12, marginTop: 16 }}>
        <div style={{ padding: '12px 16px', fontWeight: 800 }}>Historial</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px 12px' }}>
          <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={select}>
            <option value="">Todas las empresas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={select}>
            <option value="">Todos los perfiles</option>
            {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={accion} onChange={e => setAccion(e.target.value)} style={select}>
            <option value="">Todo</option>
            <option value="login">Logins</option>
            <option value="pagina">Páginas</option>
            <option value="accion">Acciones</option>
          </select>
          <form onSubmit={e => { e.preventDefault(); cargar() }} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 200 }}>
            <input placeholder="Buscar por nombre o ruta…" value={q} onChange={e => setQ(e.target.value)}
              style={{ ...select, flex: 1, minWidth: 140 }} />
            <button type="submit" style={{ ...select, cursor: 'pointer', fontWeight: 700 }}>Buscar</button>
          </form>
        </div>
        <div style={{ overflowX: 'auto', opacity: cargando ? 0.5 : 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Cuándo</th><th style={th}>Quién</th><th style={th}>Empresa</th>
              <th style={th}>Qué</th><th style={th}>Ruta</th><th style={th}>IP</th>
            </tr></thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.id}>
                  <td style={td}>{fmtFecha(f.created_at)}</td>
                  <td style={td}>{TIPO_ICON[f.actor_tipo] ?? '👤'} {f.actor_nombre ?? '—'}</td>
                  <td style={td}>{f.empresa_nombre ?? '—'}</td>
                  <td style={td}>{ACCION_LABEL[f.accion] ?? f.accion}{f.detalle ? ` · ${f.detalle}` : ''}</td>
                  <td style={{ ...td, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.ruta ?? ''}>
                    {f.ruta ?? '—'}{f.metodo && f.metodo !== 'GET' ? ` (${f.metodo})` : ''}</td>
                  <td style={{ ...td, color: 'var(--muted)', fontSize: 12 }}>{f.ip ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && filas.length === 0 && (
            <p style={{ padding: '4px 16px 16px', color: 'var(--muted)', fontSize: 13 }}>Nada registrado con estos filtros.</p>
          )}
        </div>
        {hayMas && (
          <div style={{ padding: '8px 16px 16px' }}>
            <button onClick={() => cargar(filas.length, true)} disabled={cargando}
              style={{ ...select, cursor: 'pointer', fontWeight: 700, minHeight: 44 }}>Ver más</button>
          </div>
        )}
      </section>
    </div>
  )
}
