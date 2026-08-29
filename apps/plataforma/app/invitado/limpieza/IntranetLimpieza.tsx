'use client'
// Pantalla de la limpieza (móvil primero, ≥320px): calendario 30 días × 4 pisos + resumen del
// día con limpiezas, tareas y notas. Sin nombres de huéspedes ni importes (solo ocupación y aforo).
import { useState, useEffect, useMemo, useCallback } from 'react'
import { PROPS_CALENDARIO as PROPS } from '@/lib/sivra/constantes'
import { entradaMismoDia, nocheOcupada, type ReservaIntranet, type Novedad } from '@/lib/sivra/limpieza-intranet'

const DIAS = 30
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const DOWL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Limpieza = {
  id: string; propertyId: string; fecha: string
  salida: string | null; entrada: string | null
  nota: string | null; indicaciones: string | null
  tipo: string | null; hecha: boolean
}
type Tarea = { id: string; fecha: string; propertyId: string | null; texto: string; hecha: boolean }

function iso(d: Date) { return d.toISOString().slice(0, 10) }
function fmtDM(isoFecha: string | null) {
  if (!isoFecha) return null
  const [, m, d] = isoFecha.split('-')
  return `${d}/${m}`
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function hoyDate() { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
function propDe(id: string) { return PROPS.find(p => p.id === id) }

export default function IntranetLimpieza({ modo }: { modo: 'sesion' | 'invitado' }) {
  const hoy = useMemo(() => hoyDate(), [])
  const dias = useMemo(() => Array.from({ length: DIAS }, (_, i) => addDays(hoy, i)), [hoy])
  const [reservas, setReservas] = useState<ReservaIntranet[]>([])
  const [limpiezas, setLimpiezas] = useState<Limpieza[]>([])
  const [tareas, setTareas] = useState<Tarea[]>([])
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState(iso(hoy))

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/sivra/limpieza-intranet/datos?from=${iso(hoy)}&to=${iso(addDays(hoy, DIAS - 1))}`)
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      setReservas(d.reservas ?? [])
      setLimpiezas(d.limpiezas ?? [])
      setTareas(d.tareas ?? [])
      setNovedades(d.novedades ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setCargando(false)
    }
  }, [hoy])

  useEffect(() => { cargar() }, [cargar])

  async function toggleTarea(t: Tarea) {
    // Optimista; si el PATCH falla, recarga y la tarea vuelve a su estado real.
    setTareas(prev => prev.map(x => x.id === t.id ? { ...x, hecha: !t.hecha } : x))
    const r = await fetch('/api/sivra/limpieza-intranet/tareas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, hecha: !t.hecha }),
    }).catch(() => null)
    if (!r || !r.ok) cargar()
  }

  const selDate = useMemo(() => new Date(sel + 'T12:00:00'), [sel])
  const limpiezasDia = limpiezas.filter(l => l.fecha === sel)
  const tareasDia = tareas.filter(t => t.fecha === sel)

  function fmtSel() {
    if (sel === iso(hoy)) return `Hoy · ${DOWL[selDate.getDay()].toLowerCase()} ${selDate.getDate()}`
    if (sel === iso(addDays(hoy, 1))) return `Mañana · ${DOWL[selDate.getDay()].toLowerCase()} ${selDate.getDate()}`
    return `${DOWL[selDate.getDay()]} ${selDate.getDate()} ${selDate.toLocaleDateString('es-ES', { month: 'long' })}`
  }
  function mover(n: number) {
    const d = addDays(selDate, n)
    if (d < hoy || d > addDays(hoy, DIAS - 1)) return
    setSel(iso(d))
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 12px 40px', color: 'var(--text)' }}>
      <style>{`
        .li-cal-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px}
        .li-cal{display:grid;grid-template-columns:86px repeat(${DIAS},34px);min-width:max-content}
        .li-cal .prop, .li-cal .corner{position:sticky;left:0;z-index:2;background:var(--surface)}
        .li-dia{font-size:10px;color:var(--muted);text-align:center;padding:4px 0 6px;font-weight:600;cursor:pointer;border:none;background:transparent;font-family:inherit}
        .li-dia .dow{display:block;font-weight:400;font-size:9px;text-transform:uppercase}
        .li-cell{border-top:1px solid var(--border);height:40px;position:relative;cursor:pointer}
        @media (max-width:380px){ .li-cal{grid-template-columns:74px repeat(${DIAS},32px)} }
      `}</style>

      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, padding: '16px 2px 12px' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--primary)' }}>Limpiezas · pisos de Alberto</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 800 }}>Hola, Vanesa 👋</h1>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', paddingBottom: 4 }}>
          {DOWL[hoy.getDay()]}, {hoy.getDate()} {hoy.toLocaleDateString('es-ES', { month: 'short' })}
        </div>
      </header>

      {modo === 'sesion' && (
        <div style={{ background: 'var(--primary-light, rgba(79,70,229,.08))', color: 'var(--primary)', fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '6px 12px', marginBottom: 12, textAlign: 'center' }}>
          Vista previa (tu sesión) — Vanesa ve exactamente esto con su enlace
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          No se han podido cargar los datos. Revisa la conexión y recarga la página.
        </div>
      )}

      {/* Calendario */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 6px' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Los 4 pisos · próximos {DIAS} días</h2>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>desliza →</span>
        </div>
        {cargando ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando…</div>
        ) : (
          <div className="li-cal-scroll">
            <div className="li-cal">
              <div className="corner" />
              {dias.map(d => {
                const k = iso(d)
                return (
                  <button key={k} className="li-dia" onClick={() => setSel(k)}
                    style={k === sel ? { background: 'var(--primary-light, rgba(79,70,229,.1))', color: 'var(--primary)', borderRadius: '8px 8px 0 0' }
                      : k === iso(hoy) ? { color: 'var(--primary)' } : undefined}>
                    <span className="dow">{DOW[d.getDay()]}</span>{d.getDate()}
                  </button>
                )
              })}
              {PROPS.map(p => (
                <FilaPiso key={p.id} piso={p} dias={dias} sel={sel} hoy={iso(hoy)}
                  reservas={reservas} limpiezas={limpiezas} onSel={setSel} />
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 14px 12px', fontSize: 11, color: 'var(--muted)' }}>
          <span><span style={{ display: 'inline-block', width: 18, height: 10, borderRadius: 4, background: '#3E6AA8', verticalAlign: 'middle', marginRight: 4 }} />ocupado</span>
          <span><b>→</b> entrada (nº huéspedes)</span>
          <span>🧽 limpieza</span>
          <span><span style={{ color: '#b45309' }}>🧽</span> entra huésped el mismo día</span>
        </div>
      </section>

      {/* Resumen del día */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
          <button onClick={() => mover(-1)} aria-label="Día anterior" style={btnNav}>‹</button>
          <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{fmtSel()}</div>
          <button onClick={() => mover(1)} aria-label="Día siguiente" style={btnNav}>›</button>
          <button onClick={() => setSel(iso(hoy))} style={{ ...btnNav, minWidth: 0, padding: '0 12px', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>Hoy</button>
        </div>

        <div style={{ padding: '4px 14px 12px' }}>
          <h3 style={tituloBloque}>Limpiezas del día</h3>
          {limpiezasDia.length === 0 && <div style={vacio}>No hay limpiezas este día. 🙌</div>}
          {limpiezasDia.map(l => {
            const p = propDe(l.propertyId)
            const entra = entradaMismoDia(reservas, l.propertyId, l.fecha)
            return (
              <div key={l.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: p?.color }}>{p?.label ?? l.propertyId}</span>
                  {l.hecha && <span style={{ ...chip, background: '#dcfce7', color: '#15803d' }}>✓ Hecha</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ ...chip, background: 'var(--primary-light, rgba(79,70,229,.08))', color: 'var(--primary)' }}>Salida {l.salida ?? '11:00'}</span>
                  {entra
                    ? <span style={{ ...chip, background: '#fef3c7', color: '#b45309' }}>⚠️ Entra{entra.pax != null ? `n ${entra.pax}` : ' huésped'} a las {l.entrada ?? '15:00'}</span>
                    : <span style={{ ...chip, background: '#dcfce7', color: '#15803d' }}>Sin entrada hoy — con calma</span>}
                  {l.tipo && l.tipo !== 'estandar' && <span style={chip}>{l.tipo === 'profunda' ? '🫧 Profunda' : '⚠️ Gran suciedad'}</span>}
                </div>
                {l.nota && <div style={nota}>📌 <b>Alberto:</b> {l.nota}</div>}
                {l.indicaciones && <div style={nota}>📝 {l.indicaciones}</div>}
              </div>
            )
          })}

          <h3 style={tituloBloque}>Entradas del día</h3>
          {(() => {
            const entradas = reservas.filter(r => r.checkIn === sel)
            if (!entradas.length) return <div style={vacio}>Nadie entra este día{limpiezasDia.length ? ' — las limpiezas van con calma' : ''}.</div>
            return entradas.map((r, i) => {
              const p = propDe(r.propertyId)
              const limp = limpiezasDia.find(l => l.propertyId === r.propertyId)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, fontSize: 14 }}>
                  <span>🔑</span>
                  <span style={{ fontWeight: 800, color: p?.color }}>{p?.label ?? r.propertyId}</span>
                  <span style={{ color: 'var(--muted)' }}>
                    {r.pax != null ? `entran ${r.pax} huéspedes` : 'entra huésped'}
                    {limp?.entrada ? ` · sobre las ${limp.entrada}` : ''}
                    {` · hasta el ${fmtDM(r.checkOut)}`}
                  </span>
                </div>
              )
            })
          })()}

          <h3 style={tituloBloque}>Tareas de Alberto</h3>
          {tareasDia.length === 0 && <div style={vacio}>Sin tareas apuntadas para este día.</div>}
          {tareasDia.map(t => {
            const p = t.propertyId ? propDe(t.propertyId) : null
            return (
              <button key={t.id} onClick={() => toggleTarea(t)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, background: 'transparent', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}>
                <span style={{ width: 24, height: 24, minWidth: 24, borderRadius: 8, border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, background: t.hecha ? '#16a34a' : 'transparent', borderColor: t.hecha ? '#16a34a' : 'var(--border)' }}>{t.hecha ? '✓' : ''}</span>
                <span style={{ flex: 1, color: t.hecha ? 'var(--muted)' : 'var(--text)', textDecoration: t.hecha ? 'line-through' : 'none' }}>
                  {p && <span style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: p.color }}>{p.label}</span>}
                  {t.texto}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Novedades: lo que ha cambiado respecto a lo que ya tenía planificado */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginTop: 14 }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700 }}>🔔 Novedades · últimos 14 días</h2>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          Reservas nuevas y cancelaciones que han entrado después de lo que ya tenías visto.
        </div>
        {!cargando && novedades.length === 0 && <div style={vacio}>Sin novedades: todo sigue como estaba. 👍</div>}
        {novedades.map((n, i) => {
          const p = propDe(n.propertyId)
          const rango = n.checkIn || n.checkOut
            ? `${fmtDM(n.checkIn) ?? '¿?'} → ${fmtDM(n.checkOut) ?? '¿?'}`
            : 'fechas no publicadas'
          const det = new Date(n.detectada)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: i > 0 ? '1px solid var(--border)' : 'none', padding: '8px 0', fontSize: 13.5 }}>
              <span>{n.tipo === 'nueva' ? '🆕' : '🚫'}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{n.tipo === 'nueva' ? 'Reserva nueva' : 'Cancelada'}</span>
                {' · '}<span style={{ fontWeight: 700, color: p?.color }}>{p?.label ?? n.propertyId}</span>
                {' · '}{rango}
                {n.tipo === 'nueva' && n.pax != null && ` · ${n.pax} huéspedes`}
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  detectada el {det.getDate()}/{String(det.getMonth() + 1).padStart(2, '0')} a las {String(det.getHours()).padStart(2, '0')}:{String(det.getMinutes()).padStart(2, '0')}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <footer style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '14px 20px 0', lineHeight: 1.6 }}>
        Acceso con tu enlace personal — sin contraseña.<br />Cualquier duda, escribe a Alberto por WhatsApp.
      </footer>
    </div>
  )
}

function FilaPiso({ piso, dias, sel, hoy, reservas, limpiezas, onSel }: {
  piso: (typeof PROPS)[number]; dias: Date[]; sel: string; hoy: string
  reservas: ReservaIntranet[]; limpiezas: Limpieza[]; onSel: (k: string) => void
}) {
  return (
    <>
      <div className="prop" style={{ fontSize: 12, fontWeight: 700, padding: '6px 8px 6px 14px', display: 'flex', alignItems: 'center', borderTop: '1px solid var(--border)', lineHeight: 1.2, color: piso.color }}>
        {piso.label}
      </div>
      {dias.map(d => {
        const k = iso(d)
        const res = nocheOcupada(reservas, piso.id, k)
        const empieza = res?.checkIn === k
        const acaba = res ? iso(addDays(new Date(res.checkOut + 'T12:00:00'), -1)) === k : false
        const limp = limpiezas.find(l => l.propertyId === piso.id && l.fecha === k)
        const entra = limp ? entradaMismoDia(reservas, piso.id, k) : null
        return (
          <div key={k} className="li-cell" onClick={() => onSel(k)} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') onSel(k) }}
            style={k === sel ? { background: 'var(--primary-light, rgba(79,70,229,.08))' } : undefined}>
            {k === hoy && <div style={{ position: 'absolute', inset: 0, borderLeft: '2px solid var(--primary)', opacity: .4, pointerEvents: 'none' }} />}
            {res && (
              <div style={{
                position: 'absolute', top: 8, bottom: 8, background: '#3E6AA8', zIndex: 1,
                left: empieza ? '45%' : 0, right: acaba ? '55%' : 0,
                borderTopLeftRadius: empieza ? 20 : 0, borderBottomLeftRadius: empieza ? 20 : 0,
                borderTopRightRadius: acaba ? 20 : 0, borderBottomRightRadius: acaba ? 20 : 0,
              }}>
                {empieza && (
                  <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: '#fff', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
                    →{res.pax != null ? `${res.pax}👤` : ''}
                  </span>
                )}
              </div>
            )}
            {limp && (
              <span title="Limpieza" style={{ position: 'absolute', zIndex: 2, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 20, height: 20, borderRadius: '50%', background: entra ? '#d97706' : '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>🧽</span>
            )}
          </div>
        )
      })}
    </>
  )
}

const btnNav: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, minWidth: 44, minHeight: 40, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit',
}
const tituloBloque: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em',
  color: 'var(--muted)', margin: '14px 0 8px',
}
const vacio: React.CSSProperties = { color: 'var(--muted)', fontSize: 13, padding: '2px 0 6px' }
const chip: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
  background: 'var(--border)', color: 'var(--muted)',
}
const nota: React.CSSProperties = {
  background: '#fef9c3', border: '1px solid #fde68a', color: '#92400e',
  borderRadius: 10, padding: '7px 10px', fontSize: 13, marginTop: 8,
}
