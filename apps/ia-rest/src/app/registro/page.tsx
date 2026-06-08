'use client'

import React, { useState } from 'react'
import { copyToClipboard } from '@/lib/clipboard'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const T = {
  bg: 'var(--paper)', elev: 'var(--bone)', elev2: 'var(--paper-2)',
  fg: 'var(--ink)', fg2: 'var(--ink-2)', fg3: 'var(--ink-3)',
  ruleS: 'var(--rule)', vermilion: 'var(--vermilion)',
  green: 'var(--green)', amber: 'var(--amber)',
}

function precioMensual(n: number) {
  if (n <= 1) return 59
  if (n <= 6) return 59 + (n - 1) * 20
  return 59 + 5 * 20 + (n - 6) * 15
}

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

const DOMAIN_TYPOS: Record<string, string> = {
  'gmail.co': 'gmail.com',     'gmail.cm': 'gmail.com',     'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',    'gmal.com': 'gmail.com',     'gmaill.com': 'gmail.com',
  'hotmail.co': 'hotmail.com', 'hotmail.cm': 'hotmail.com',
  'hotmai.com': 'hotmail.com', 'hotmial.com': 'hotmail.com',
  'outlook.co': 'outlook.com', 'outloook.com': 'outlook.com',
  'yahoo.co': 'yahoo.com',     'yaho.com': 'yahoo.com',
  'icloud.co': 'icloud.com',   'iclooud.com': 'icloud.com',
}

interface Created {
  checkout_url:   string
  codigo_acceso:  string
  pin_owner:      string
  restaurante_id: string
}

const CLAUSULAS = [
  { titulo: 'Servicio bajo suscripción', texto: '14 días de prueba gratis. Plan mensual sin permanencia o anual con 18 % de descuento. Cancelas cuando quieras desde tu panel.' },
  { titulo: 'Servicio en "mejor esfuerzo"', texto: 'ia.rest depende de infraestructura de terceros (Vercel, Supabase, Groq). No garantizamos disponibilidad ininterrumpida. Los errores de transcripción o interpretación de IA son posibles.' },
  { titulo: 'Limitación de responsabilidad', texto: 'La indemnización máxima por cualquier fallo es 1 mes de cuota. Quedan excluidos el lucro cesante y los daños indirectos. Eres responsable de verificar las comandas antes de confirmarlas.' },
  { titulo: 'Alérgenos y VeriFactu', texto: 'El sistema de alérgenos es una herramienta de apoyo, no sustituye tu responsabilidad legal. Las facturas VeriFactu requieren configurar correctamente tu NIF y razón social.' },
  { titulo: 'Compatibilidad de hardware', texto: 'Las impresoras están garantizadas solo con protocolo ESC/POS TCP/IP y CloudPRNT Star LAN/Wi-Fi. Otros modelos pueden funcionar pero sin garantía de soporte.' },
  { titulo: 'Tus datos son tuyos', texto: 'ia.rest actúa como encargado del tratamiento (RGPD). Puedes exportar y borrar tus datos en cualquier momento. El uso para entrenamiento de IA es opt-in.' },
  { titulo: 'Datos agregados y estadísticos', texto: 'ia.rest podrá utilizar datos de uso de la plataforma de forma agregada y completamente anonimizada — sin posibilidad de identificar tu establecimiento — con fines estadísticos, de mejora del servicio y comerciales. Nunca se compartirán datos individuales de tu negocio con terceros sin tu consentimiento expreso.' },
]

export default function RegistroPage() {
  const [nombre, setNombre]       = useState('')
  const [email, setEmail]         = useState('')
  const [rest, setRest]           = useState('')
  const [nU, setNU]               = useState(1)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [emailWarn, setEmailWarn] = useState('')
  const [created, setCreated]     = useState<Created | null>(null)
  const [copied, setCopied]       = useState(false)
  const [step, setStep]           = useState<'pin' | 'contrato'>('pin')
  const [aceptado, setAceptado]   = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptErr, setAcceptErr] = useState('')

  function checkEmailWarn(val: string) {
    if (!val.includes('@')) { setEmailWarn(''); return }
    const domain = val.split('@')[1]?.toLowerCase() ?? ''
    setEmailWarn(DOMAIN_TYPOS[domain] ?? '')
  }

  function applyEmailFix() {
    const parts  = email.split('@')
    const domain = parts[1]?.toLowerCase() ?? ''
    const fixed  = DOMAIN_TYPOS[domain]
    if (fixed) { setEmail(parts[0] + '@' + fixed); setEmailWarn('') }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    if (!EMAIL_RE.test(email.trim())) {
      setError('El email no tiene un formato válido. Revisa que incluya @ y un dominio correcto (ej: nombre@empresa.com)')
      setLoading(false)
      return
    }
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/auth-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ nombre: nombre.trim(), email: email.trim().toLowerCase(), nombre_restaurante: rest.trim(), num_usuarios: nU }),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.error)
      setCreated(d)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  function copiar() {
    if (!created) return
    copyToClipboard(created.pin_owner).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function aceptarContrato() {
    if (!created || !aceptado) return
    setAccepting(true); setAcceptErr('')
    try {
      const r = await fetch('/api/contrato/aceptar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurante_id: created.restaurante_id, email }),
      })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error ?? 'Error al registrar la aceptación')
      window.location.href = created.checkout_url
    } catch (err: any) { setAcceptErr(err.message) }
    finally { setAccepting(false) }
  }

  // ─── Vista: PIN creado ──────────────────────────────────────────────────
  if (created && step === 'pin') return (
    <div style={pageS}>
      <Logo />
      <div style={cardS}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(63,125,68,.12)', border: `2px solid ${T.green}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>
          </div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: T.fg, margin: '0 0 6px' }}>¡Cuenta creada!</h2>
          <p style={{ fontSize: 13, color: T.fg3, margin: 0 }}>Guarda estos datos antes de continuar al pago.</p>
        </div>

        <div style={boxS}>
          <div style={labelMonoS}>Código de restaurante</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: T.fg, letterSpacing: '.12em' }}>{created.codigo_acceso}</div>
          <div style={{ fontSize: 12, color: T.fg3, marginTop: 4 }}>Lo usarás en la pantalla de login</div>
        </div>

        <div style={{ ...boxS, borderColor: T.amber, background: 'rgba(232,163,59,.06)' }}>
          <div style={{ ...labelMonoS, color: T.amber }}>Tu PIN de propietario</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 38, fontWeight: 700, color: T.fg, letterSpacing: '.2em' }}>{created.pin_owner}</div>
            <button onClick={copiar} style={{ background: copied ? 'rgba(63,125,68,.15)' : T.elev2, border: `1px solid ${copied ? T.green : T.ruleS}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: copied ? T.green : T.fg3, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all .15s' }}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: T.amber, marginTop: 6, fontWeight: 600 }}>⚠ Cámbialo desde /owner → Personal después de entrar</div>
        </div>

        <div style={{ background: 'rgba(217,68,43,.08)', border: '1px solid rgba(217,68,43,.3)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: T.fg2, lineHeight: 1.6 }}>
          <strong style={{ color: T.vermilion }}>Importante:</strong> este PIN solo se muestra una vez. Anótalo ahora.
        </div>

        <button onClick={() => setStep('contrato')} style={{ background: T.vermilion, color: '#fff', border: 'none', borderRadius: 10, padding: '15px 0', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer', letterSpacing: '-0.2px' }}>
          Ya lo tengo — ver contrato →
        </button>
        <p style={{ fontSize: 12, color: T.fg3, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>14 días gratis. Sin cargos hasta que finalice el trial.</p>
      </div>
    </div>
  )

  // ─── Vista: aceptación del contrato ────────────────────────────────────
  if (created && step === 'contrato') return (
    <div style={pageS}>
      <Logo />
      <div style={{ ...cardS, maxWidth: 520 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: T.fg3, textTransform: 'uppercase' as const, marginBottom: 6 }}>
            Paso 2 de 2 — Contrato de servicio
          </div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 22, color: T.fg, margin: '0 0 4px' }}>
            Revisa las condiciones
          </h2>
          <p style={{ fontSize: 13, color: T.fg3, margin: 0, lineHeight: 1.6 }}>
            Resumen de los puntos más relevantes. Puedes descargar el contrato completo antes de aceptar.
          </p>
        </div>

        <a href="/contrato-iarest-v1.pdf" target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.elev2, border: `1px solid ${T.ruleS}`, borderRadius: 10, padding: '12px 16px', textDecoration: 'none', color: T.fg2, fontSize: 13, fontWeight: 600 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span>Descargar contrato completo (PDF)</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.fg3 }}>contrato_iarest_v1.pdf</span>
        </a>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {CLAUSULAS.map((c, i) => (
            <div key={i} style={{ background: T.elev2, border: `1px solid ${T.ruleS}`, borderRadius: 8, padding: '11px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.fg2, marginBottom: 3 }}>{c.titulo}</div>
              <div style={{ fontSize: 12, color: T.fg3, lineHeight: 1.6 }}>{c.texto}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: T.ruleS }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '4px 0' }} onClick={() => setAceptado(v => !v)}>
          <div style={{
            width: 20, height: 20, minWidth: 20, borderRadius: 5,
            border: `2px solid ${aceptado ? T.vermilion : T.ruleS}`,
            background: aceptado ? 'rgba(217,68,43,.15)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginTop: 1, transition: 'all .15s',
          }}>
            {aceptado && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.vermilion} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 18 20 6"/></svg>}
          </div>
          <span style={{ fontSize: 13, color: T.fg2, lineHeight: 1.6 }}>
            He leído y acepto el{' '}
            <a href="/contrato-iarest-v1.pdf" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.fg, textDecoration: 'underline' }}>
              Contrato de Prestación de Servicios SaaS
            </a>
            , incluyendo la limitación de responsabilidad, los requisitos de hardware y las condiciones de VeriFactu y alérgenos.
          </span>
        </div>

        {acceptErr && (
          <div style={{ background: 'var(--vermilion-s)', border: `1px solid ${T.vermilion}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--vermilion-d)' }}>{acceptErr}</div>
        )}

        <button onClick={aceptarContrato} disabled={!aceptado || accepting} style={{
          background: aceptado && !accepting ? T.vermilion : T.elev2,
          color: aceptado && !accepting ? '#fff' : T.fg3,
          border: 'none', borderRadius: 10, padding: '15px 0',
          fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)',
          cursor: aceptado && !accepting ? 'pointer' : 'not-allowed',
          transition: 'all .15s', letterSpacing: '-0.2px',
        }}>
          {accepting ? 'Guardando aceptación…' : 'Acepto y continuar al pago →'}
        </button>

        <button onClick={() => setStep('pin')} style={{ background: 'none', border: 'none', color: T.fg3, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, textDecoration: 'underline', textAlign: 'center' as const }}>
          ← Volver a mis credenciales
        </button>

        <p style={{ fontSize: 11, color: T.fg3, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
          La aceptación queda registrada con fecha, hora e IP como prueba legal (LSSI art. 27).
        </p>
      </div>
    </div>
  )

  // ─── Vista: formulario inicial ──────────────────────────────────────────
  return (
    <div style={pageS}>
      <Logo />
      <div style={cardS}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 26, color: T.fg, margin: '0 0 6px', letterSpacing: '-0.3px' }}>14 días gratis</h1>
        <p style={{ fontSize: 14, color: T.fg3, margin: '0 0 4px' }}>Sin tarjeta hasta que acabe el trial. Sin permanencia.</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Tu nombre"><input type="text" placeholder="María García" value={nombre} onChange={e => setNombre(e.target.value)} required style={inputS} /></Field>

          <div>
            <label style={labelS}>Email</label>
            <input type="email" placeholder="maria@labodega.es" value={email}
              onChange={e => { setEmail(e.target.value); checkEmailWarn(e.target.value) }}
              required style={{ ...inputS, borderColor: emailWarn ? T.amber : 'var(--rule)' }}
            />
            {emailWarn && (
              <div style={{ marginTop: 6, fontSize: 12, color: T.amber, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>⚠</span>
                <span>¿Quisiste decir <strong>@{emailWarn}</strong>?</span>
                <button type="button" onClick={applyEmailFix} style={{ background: 'none', border: 'none', color: T.amber, textDecoration: 'underline', cursor: 'pointer', fontSize: 12, paddingLeft: 4, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>Corregir</button>
              </div>
            )}
          </div>

          <Field label="Nombre del restaurante"><input type="text" placeholder="Bodega La Plaza" value={rest} onChange={e => setRest(e.target.value)} required style={inputS} /></Field>

          <div>
            <label style={labelS}>Usuarios de sala <span style={{ color: T.fg3, fontWeight: 400 }}>(camareros + jefe de sala)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button type="button" onClick={() => setNU(Math.max(1, nU - 1))} style={stepS}>−</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: T.fg, minWidth: 32, textAlign: 'center' as const }}>{nU}</span>
              <button type="button" onClick={() => setNU(nU + 1)} style={stepS}>+</button>
              <span style={{ fontSize: 13, color: T.fg3 }}>El dueño no cuenta</span>
            </div>
          </div>

          <div style={{ background: T.elev2, border: `1px solid ${T.ruleS}`, borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: T.fg3, marginBottom: 2 }}>Total mensual</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: T.fg, letterSpacing: '-0.5px' }}>
                {precioMensual(nU)}€<span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: T.fg3, fontStyle: 'normal' }}>/mes</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: T.fg3, lineHeight: 1.5 }}>
              {nU === 1 && '59€ base · 1 usuario'}
              {nU > 1 && nU <= 6 && `59€ base + ${nU - 1}×20€`}
              {nU > 6 && `59€ base + 5×20€ + ${nU - 6}×15€`}
              <br /><span style={{ color: T.green }}>14 días gratis incluidos</span>
            </div>
          </div>

          {error && <div style={{ background: 'var(--vermilion-s)', border: `1px solid ${T.vermilion}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--vermilion-d)' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{ marginTop: 4, background: loading ? T.elev2 : T.vermilion, color: loading ? T.fg3 : '#fff', border: 'none', borderRadius: 10, padding: '15px 0', fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: loading ? 'not-allowed' : 'pointer', transition: 'background .15s', letterSpacing: '-0.2px' }}>
            {loading ? 'Preparando tu cuenta…' : 'Empezar 14 días gratis →'}
          </button>
        </form>

        <p style={{ fontSize: 12, color: T.fg3, textAlign: 'center', margin: '4px 0 0', lineHeight: 1.6 }}>
          Al continuar aceptas los <a href="/terminos" style={{ color: T.fg2, textDecoration: 'underline' }}>términos de uso</a>. Sin permanencia.
        </p>
      </div>
      <p style={{ fontSize: 12, color: T.fg3, marginTop: 24 }}>¿Ya tienes cuenta? <a href="/login" style={{ color: T.fg2, textDecoration: 'underline' }}>Inicia sesión</a></p>
    </div>
  )
}

function Logo() {
  return (
    <a href="/" style={{ textDecoration: 'none', marginBottom: 32 }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.5px' }}>
        ia<span style={{ color: 'var(--vermilion)' }}>.</span>rest
      </span>
    </a>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelS}>{label}</label>{children}</div>
}

const pageS: React.CSSProperties  = { minHeight: '100vh', background: 'var(--paper)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', fontFamily: 'var(--font-sans)' }
const cardS: React.CSSProperties  = { width: '100%', maxWidth: 440, background: 'var(--bone)', borderRadius: 16, border: '1px solid var(--rule)', padding: '36px 32px', display: 'flex', flexDirection: 'column', gap: 16 }
const boxS: React.CSSProperties   = { background: 'var(--paper-2)', border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 16px' }
const labelMonoS: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: 8 }
const labelS: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }
const inputS: React.CSSProperties = { width: '100%', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 8, padding: '11px 14px', fontSize: 15, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' }
const stepS: React.CSSProperties  = { width: 36, height: 36, background: 'var(--paper-2)', border: '1px solid var(--rule)', borderRadius: 8, color: 'var(--ink-2)', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-sans)' }
