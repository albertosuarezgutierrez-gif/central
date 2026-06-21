'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const C = {
  dark: '#14110E', bg2: '#1E1A15', bg3: '#2A221A',
  paper: '#F6F1E7', ink2: '#D8CDB6', ink3: '#9C8E7E',
  red: '#D9442B', amber: '#E8A33B', green: '#3F7D44', rule: '#2E2720'
}

const PASOS = ['El evento', 'Los invitados', 'Detalles', 'Tu contacto']

const TIPOS_EVENTO = [
  { id: 'boda', label: '💍 Boda', icon: '💍' },
  { id: 'comunion', label: '✝️ Comunión', icon: '✝️' },
  { id: 'corporativo', label: '🏢 Corporativo', icon: '🏢' },
  { id: 'cumpleanos', label: '🎂 Cumpleaños', icon: '🎂' },
  { id: 'catering', label: '🍽️ Catering', icon: '🍽️' },
  { id: 'otro', label: '✨ Otro', icon: '✨' }
]

const HORARIOS = [
  { id: 'manana', label: '☀️ Mañana' },
  { id: 'mediodia', label: '🌤️ Mediodía' },
  { id: 'tarde', label: '🌅 Tarde' },
  { id: 'noche', label: '🌙 Noche' }
]

const MODALIDADES = [
  { id: 'sentado', label: '🪑 Sentado' },
  { id: 'coctel', label: '🥂 Cóctel' },
  { id: 'buffet', label: '🍱 Buffet' },
  { id: 'mixto', label: '🔀 Mixto' }
]

const BARRAS = [
  { id: 'no', label: 'Sin barra libre' },
  { id: 'sin_alcohol', label: 'Sin alcohol' },
  { id: 'basica', label: 'Básica' },
  { id: 'estandar', label: 'Estándar' },
  { id: 'premium', label: 'Premium 🌟' }
]

const ALERGENOS_LISTA = ['Gluten', 'Lactosa', 'Huevo', 'Marisco', 'Pescado', 'Frutos secos', 'Soja', 'Apio', 'Mostaza', 'Sésamo', 'Sulfitos', 'Moluscos', 'Altramuces']
const DIETETICAS = ['Vegetariano', 'Vegano', 'Sin gluten', 'Halal', 'Kosher']
const EXTRAS = ['Música/DJ', 'Fotografía', 'Flores/Decoración', 'Audiovisual', 'Animación infantil', 'Photocall']

interface Restaurante { nombre: string; logo_url?: string; ciudad?: string }
interface BriefingData { id: string; token: string; cliente_nombre?: string; cliente_email?: string; cliente_telefono?: string; restaurante: Restaurante }

export default function BriefingWizardPage() {
  const { token } = useParams<{ token: string }>()
  const [paso, setPaso] = useState(0)
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  const [resp, setResp] = useState({
    tipo_evento: '', fecha_tentativa: '', horario: '', espacio_tipo: 'interior',
    adultos: 0, ninos: 0, ninos_edades: '', modalidad: '',
    barra_libre: 'no', alergenos: [] as string[], restricciones_dieteticas: [] as string[],
    servicios_extra: [] as string[], presupuesto_adulto: 0, presupuesto_nino: 0,
    observaciones: ''
  })

  const [contacto, setContacto] = useState({ nombre: '', email: '', telefono: '' })

  useEffect(() => {
    fetch(`/api/evento/briefing/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.briefing) {
          setBriefing(d.briefing)
          setContacto({
            nombre: d.briefing.cliente_nombre || '',
            email: d.briefing.cliente_email || '',
            telefono: d.briefing.cliente_telefono || ''
          })
        } else setError(d.error || 'Enlace no válido')
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setCargando(false))
  }, [token])

  const toggleArr = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]

  const puedeAvanzar = () => {
    if (paso === 0) return resp.tipo_evento && resp.fecha_tentativa && resp.horario
    if (paso === 1) return resp.adultos > 0 && resp.modalidad
    if (paso === 2) return true
    return contacto.nombre && contacto.email
  }

  const enviar = async () => {
    setEnviando(true)
    try {
      const r = await fetch(`/api/evento/briefing/${token}/completar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: resp, ...contacto })
      })
      const d = await r.json()
      if (d.ok) setEnviado(true)
      else setError(d.error || 'Error al enviar')
    } catch { setError('Error de conexión') }
    finally { setEnviando(false) }
  }

  const sh = (style: React.CSSProperties) => style

  if (cargando) return (
    <div style={sh({ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
      <div style={sh({ color: C.ink2, fontFamily: 'Inter Tight, sans-serif' })}>Cargando...</div>
    </div>
  )

  if (error) return (
    <div style={sh({ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' })}>
      <div style={sh({ textAlign: 'center', color: C.paper, fontFamily: 'Inter Tight, sans-serif' })}>
        <div style={sh({ fontSize: '3rem', marginBottom: '1rem' })}>🔗</div>
        <div style={sh({ fontSize: '1.2rem', marginBottom: '0.5rem' })}>Enlace no válido</div>
        <div style={sh({ color: C.ink3, fontSize: '0.9rem' })}>{error}</div>
      </div>
    </div>
  )

  if (enviado) return (
    <div style={sh({ minHeight: '100vh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' })}>
      <div style={sh({ textAlign: 'center', maxWidth: 480 })}>
        <div style={sh({ fontSize: '4rem', marginBottom: '1.5rem' })}>🎉</div>
        <h1 style={sh({ fontFamily: 'Newsreader, serif', color: C.paper, fontSize: '1.8rem', marginBottom: '1rem' })}>
          ¡Perfecto, {contacto.nombre}!
        </h1>
        <p style={sh({ color: C.ink2, fontFamily: 'Inter Tight, sans-serif', lineHeight: 1.6 })}>
          Hemos recibido tu consulta. En breve nos pondremos en contacto contigo con una propuesta personalizada.
        </p>
        <div style={sh({ marginTop: '2rem', padding: '1rem', background: C.bg2, borderRadius: 12, color: C.ink3, fontSize: '0.85rem', fontFamily: 'Inter Tight, sans-serif' })}>
          Recibirás respuesta en menos de 24 horas en<br/>
          <span style={{ color: C.amber }}>{contacto.email}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div style={sh({ minHeight: '100vh', background: C.dark, fontFamily: 'Inter Tight, sans-serif' })}>
      {/* Header restaurante */}
      <div style={sh({ background: C.bg2, borderBottom: `1px solid ${C.rule}`, padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' })}>
        {briefing?.restaurante?.logo_url && (
          <img src={briefing.restaurante.logo_url} alt="logo" style={sh({ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' })} />
        )}
        <div>
          <div style={sh({ color: C.paper, fontWeight: 600, fontSize: '0.95rem' })}>{briefing?.restaurante?.nombre}</div>
          <div style={sh({ color: C.ink3, fontSize: '0.78rem' })}>Consulta de evento</div>
        </div>
      </div>

      {/* Progreso */}
      <div style={sh({ padding: '1.25rem 1.5rem 0' })}>
        <div style={sh({ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' })}>
          {PASOS.map((p, i) => (
            <div key={i} style={sh({
              flex: 1, height: 4, borderRadius: 2,
              background: i <= paso ? C.red : C.rule,
              transition: 'background 0.3s'
            })} />
          ))}
        </div>
        <div style={sh({ color: C.ink3, fontSize: '0.78rem' })}>
          Paso {paso + 1} de {PASOS.length} — {PASOS[paso]}
        </div>
      </div>

      {/* Contenido pasos */}
      <div style={sh({ padding: '1.5rem', maxWidth: 540, margin: '0 auto' })}>

        {/* PASO 0 — El evento */}
        {paso === 0 && (
          <div>
            <h2 style={sh({ color: C.paper, fontSize: '1.4rem', fontFamily: 'Newsreader, serif', marginBottom: '1.5rem' })}>
              ¿Qué tipo de evento es?
            </h2>
            <div style={sh({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' })}>
              {TIPOS_EVENTO.map(t => (
                <button key={t.id} onClick={() => setResp(r => ({ ...r, tipo_evento: t.id }))}
                  style={sh({ padding: '0.9rem', border: `2px solid ${resp.tipo_evento === t.id ? C.red : C.rule}`, borderRadius: 10, background: resp.tipo_evento === t.id ? 'rgba(217,68,43,0.15)' : C.bg2, color: C.paper, cursor: 'pointer', fontSize: '0.9rem', textAlign: 'center', transition: 'all 0.2s' })}>
                  <div style={sh({ fontSize: '1.5rem', marginBottom: '0.3rem' })}>{t.icon}</div>
                  {t.label.replace(t.icon + ' ', '')}
                </button>
              ))}
            </div>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>
              Fecha aproximada
            </label>
            <input type="date" value={resp.fecha_tentativa}
              onChange={e => setResp(r => ({ ...r, fecha_tentativa: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
              style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1rem', marginBottom: '1.25rem', boxSizing: 'border-box' })} />

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Horario</label>
            <div style={sh({ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' })}>
              {HORARIOS.map(h => (
                <button key={h.id} onClick={() => setResp(r => ({ ...r, horario: h.id }))}
                  style={sh({ padding: '0.65rem', border: `2px solid ${resp.horario === h.id ? C.red : C.rule}`, borderRadius: 8, background: resp.horario === h.id ? 'rgba(217,68,43,0.15)' : C.bg2, color: resp.horario === h.id ? C.paper : C.ink2, cursor: 'pointer', fontSize: '0.88rem' })}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PASO 1 — Los invitados */}
        {paso === 1 && (
          <div>
            <h2 style={sh({ color: C.paper, fontSize: '1.4rem', fontFamily: 'Newsreader, serif', marginBottom: '1.5rem' })}>
              ¿Cuántos seréis?
            </h2>

            <div style={sh({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' })}>
              <div>
                <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Adultos</label>
                <input type="number" min={0} value={resp.adultos || ''}
                  onChange={e => setResp(r => ({ ...r, adultos: parseInt(e.target.value) || 0 }))}
                  style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1.1rem', boxSizing: 'border-box' })} />
              </div>
              <div>
                <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Niños</label>
                <input type="number" min={0} value={resp.ninos || ''}
                  onChange={e => setResp(r => ({ ...r, ninos: parseInt(e.target.value) || 0 }))}
                  style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1.1rem', boxSizing: 'border-box' })} />
              </div>
            </div>

            {resp.ninos > 0 && (
              <div style={sh({ marginBottom: '1.25rem' })}>
                <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Edades de los niños</label>
                <input type="text" placeholder="Ej: 4, 7, 10 años" value={resp.ninos_edades}
                  onChange={e => setResp(r => ({ ...r, ninos_edades: e.target.value }))}
                  style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '0.95rem', boxSizing: 'border-box' })} />
              </div>
            )}

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Modalidad</label>
            <div style={sh({ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' })}>
              {MODALIDADES.map(m => (
                <button key={m.id} onClick={() => setResp(r => ({ ...r, modalidad: m.id }))}
                  style={sh({ padding: '0.65rem', border: `2px solid ${resp.modalidad === m.id ? C.red : C.rule}`, borderRadius: 8, background: resp.modalidad === m.id ? 'rgba(217,68,43,0.15)' : C.bg2, color: resp.modalidad === m.id ? C.paper : C.ink2, cursor: 'pointer', fontSize: '0.88rem' })}>
                  {m.label}
                </button>
              ))}
            </div>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>Barra libre</label>
            <div style={sh({ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' })}>
              {BARRAS.map(b => (
                <button key={b.id} onClick={() => setResp(r => ({ ...r, barra_libre: b.id }))}
                  style={sh({ padding: '0.5rem 0.9rem', border: `2px solid ${resp.barra_libre === b.id ? C.red : C.rule}`, borderRadius: 20, background: resp.barra_libre === b.id ? 'rgba(217,68,43,0.15)' : C.bg2, color: resp.barra_libre === b.id ? C.paper : C.ink2, cursor: 'pointer', fontSize: '0.85rem' })}>
                  {b.label}
                </button>
              ))}
            </div>

            <div style={sh({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' })}>
              <div>
                <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>
                  Presupuesto adulto (€/p)
                </label>
                <input type="number" min={0} value={resp.presupuesto_adulto || ''}
                  onChange={e => setResp(r => ({ ...r, presupuesto_adulto: parseFloat(e.target.value) || 0 }))}
                  placeholder="Ej: 55"
                  style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1rem', boxSizing: 'border-box' })} />
              </div>
              {resp.ninos > 0 && (
                <div>
                  <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>
                    Presupuesto niño (€/p)
                  </label>
                  <input type="number" min={0} value={resp.presupuesto_nino || ''}
                    onChange={e => setResp(r => ({ ...r, presupuesto_nino: parseFloat(e.target.value) || 0 }))}
                    placeholder="Ej: 10"
                    style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1rem', boxSizing: 'border-box' })} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* PASO 2 — Detalles */}
        {paso === 2 && (
          <div>
            <h2 style={sh({ color: C.paper, fontSize: '1.4rem', fontFamily: 'Newsreader, serif', marginBottom: '1.5rem' })}>
              Detalles importantes
            </h2>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.6rem' })}>
              Alergenos conocidos
            </label>
            <div style={sh({ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' })}>
              {ALERGENOS_LISTA.map(a => (
                <button key={a} onClick={() => setResp(r => ({ ...r, alergenos: toggleArr(r.alergenos, a) }))}
                  style={sh({ padding: '0.4rem 0.75rem', border: `2px solid ${resp.alergenos.includes(a) ? C.amber : C.rule}`, borderRadius: 20, background: resp.alergenos.includes(a) ? 'rgba(232,163,59,0.15)' : C.bg2, color: resp.alergenos.includes(a) ? C.amber : C.ink3, cursor: 'pointer', fontSize: '0.8rem' })}>
                  {a}
                </button>
              ))}
            </div>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.6rem' })}>
              Restricciones dietéticas
            </label>
            <div style={sh({ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' })}>
              {DIETETICAS.map(d => (
                <button key={d} onClick={() => setResp(r => ({ ...r, restricciones_dieteticas: toggleArr(r.restricciones_dieteticas, d) }))}
                  style={sh({ padding: '0.4rem 0.75rem', border: `2px solid ${resp.restricciones_dieteticas.includes(d) ? C.green : C.rule}`, borderRadius: 20, background: resp.restricciones_dieteticas.includes(d) ? 'rgba(63,125,68,0.15)' : C.bg2, color: resp.restricciones_dieteticas.includes(d) ? C.green : C.ink3, cursor: 'pointer', fontSize: '0.8rem' })}>
                  {d}
                </button>
              ))}
            </div>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.6rem' })}>
              Servicios adicionales
            </label>
            <div style={sh({ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' })}>
              {EXTRAS.map(e => (
                <button key={e} onClick={() => setResp(r => ({ ...r, servicios_extra: toggleArr(r.servicios_extra, e) }))}
                  style={sh({ padding: '0.4rem 0.75rem', border: `2px solid ${resp.servicios_extra.includes(e) ? C.red : C.rule}`, borderRadius: 20, background: resp.servicios_extra.includes(e) ? 'rgba(217,68,43,0.15)' : C.bg2, color: resp.servicios_extra.includes(e) ? C.paper : C.ink3, cursor: 'pointer', fontSize: '0.8rem' })}>
                  {e}
                </button>
              ))}
            </div>

            <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>
              ¿Algo más que debamos saber?
            </label>
            <textarea value={resp.observaciones}
              onChange={e => setResp(r => ({ ...r, observaciones: e.target.value }))}
              placeholder="Petición especial, temática, preferencias..."
              rows={3}
              style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'Inter Tight, sans-serif' })} />
          </div>
        )}

        {/* PASO 3 — Contacto */}
        {paso === 3 && (
          <div>
            <h2 style={sh({ color: C.paper, fontSize: '1.4rem', fontFamily: 'Newsreader, serif', marginBottom: '0.5rem' })}>
              ¿Cómo te llamamos?
            </h2>
            <p style={sh({ color: C.ink3, fontSize: '0.85rem', marginBottom: '1.5rem' })}>
              Te enviaremos una propuesta personalizada en menos de 24 horas
            </p>

            {[
              { key: 'nombre', label: 'Nombre y apellidos', type: 'text', placeholder: 'María García López' },
              { key: 'email', label: 'Email', type: 'email', placeholder: 'tu@email.com' },
              { key: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '600 000 000' }
            ].map(f => (
              <div key={f.key} style={sh({ marginBottom: '1rem' })}>
                <label style={sh({ display: 'block', color: C.ink2, fontSize: '0.85rem', marginBottom: '0.4rem' })}>{f.label}</label>
                <input type={f.type} value={contacto[f.key as keyof typeof contacto]}
                  onChange={e => setContacto(c => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={sh({ width: '100%', padding: '0.75rem', background: C.bg3, border: `1px solid ${C.rule}`, borderRadius: 8, color: C.paper, fontSize: '1rem', boxSizing: 'border-box' })} />
              </div>
            ))}

            {/* Resumen */}
            <div style={sh({ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '1rem', marginTop: '1.5rem' })}>
              <div style={sh({ color: C.ink3, fontSize: '0.78rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' })}>Resumen de tu consulta</div>
              <div style={sh({ color: C.ink2, fontSize: '0.88rem', lineHeight: 1.8 })}>
                <div>🎉 {TIPOS_EVENTO.find(t => t.id === resp.tipo_evento)?.label}</div>
                <div>📅 {resp.fecha_tentativa} · {HORARIOS.find(h => h.id === resp.horario)?.label}</div>
                <div>👥 {resp.adultos} adultos{resp.ninos > 0 ? ` + ${resp.ninos} niños` : ''}</div>
                {resp.presupuesto_adulto > 0 && <div>💶 ~{resp.presupuesto_adulto}€/persona</div>}
                {resp.barra_libre !== 'no' && <div>🍾 Barra {resp.barra_libre}</div>}
              </div>
            </div>
          </div>
        )}

        {/* Navegación */}
        <div style={sh({ display: 'flex', gap: '0.75rem', marginTop: '2rem' })}>
          {paso > 0 && (
            <button onClick={() => setPaso(p => p - 1)}
              style={sh({ flex: 1, padding: '0.9rem', background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, color: C.ink2, cursor: 'pointer', fontSize: '0.95rem' })}>
              ← Atrás
            </button>
          )}
          <button
            onClick={() => paso < 3 ? setPaso(p => p + 1) : enviar()}
            disabled={!puedeAvanzar() || enviando}
            style={sh({ flex: 2, padding: '0.9rem', background: puedeAvanzar() ? C.red : C.bg3, border: 'none', borderRadius: 10, color: C.paper, cursor: puedeAvanzar() ? 'pointer' : 'not-allowed', fontSize: '1rem', fontWeight: 600, opacity: enviando ? 0.7 : 1 })}>
            {enviando ? 'Enviando...' : paso < 3 ? 'Siguiente →' : '✅ Enviar consulta'}
          </button>
        </div>
      </div>
    </div>
  )
}
