'use client'
// Formulario de captación. Es la única cosa de esta web que produce dinero, así
// que se cuida más que el resto: campos grandes, teclado correcto en móvil y
// tres estados visibles (enviando · recibido · el motivo exacto por el que no).
//
// 🚨 Art. 13 RGPD y art. 19 de la Ley 16/2018: quién trata los datos y quién
// media se dicen ANTES de que la persona escriba su correo, no en una página
// aparte a la que nadie entra. De ahí el bloque de aviso encima del botón y el
// consentimiento explícito, que va sin marcar por defecto (una casilla premarcada
// no es consentimiento válido).
import { useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { TIPOS_SEGURO, ETIQUETA_TIPO, CAMPO_HONEYPOT, MAX_COMENTARIO } from '@/lib/contrato-lead'

const campo: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  padding: '10px 12px',
  // 16 px exactos: por debajo, Safari en iPhone hace zoom al enfocar el campo y
  // el visitante se queda con la página descuadrada a mitad del formulario.
  fontSize: 16,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
}
const etiqueta: CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }
const fila: CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

type Estado =
  | { fase: 'idle' }
  | { fase: 'enviando' }
  | { fase: 'ok' }
  | { fase: 'error'; motivo: string; campo: string | null }

export default function Formulario({ ramoPorDefecto }: { ramoPorDefecto?: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' })
  const [consentimiento, setConsentimiento] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (estado.fase === 'enviando') return
    const fd = new FormData(e.currentTarget)
    setEstado({ fase: 'enviando' })
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: fd.get('nombre'),
          apellidos: fd.get('apellidos'),
          telefono: fd.get('telefono'),
          email: fd.get('email'),
          tipoSeguro: fd.get('tipoSeguro'),
          comentario: fd.get('comentario'),
          consentimiento,
          [CAMPO_HONEYPOT]: fd.get(CAMPO_HONEYPOT),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; motivo?: string; campo?: string | null }
      if (res.ok && json.ok) setEstado({ fase: 'ok' })
      else
        setEstado({
          fase: 'error',
          motivo: json.motivo || 'No se ha podido enviar. Inténtalo de nuevo.',
          campo: json.campo ?? null,
        })
    } catch {
      setEstado({ fase: 'error', motivo: 'Sin conexión. Inténtalo de nuevo.', campo: null })
    }
  }

  if (estado.fase === 'ok') {
    return (
      <div
        role="status"
        style={{ background: 'var(--accent-soft)', color: 'var(--brand-ink)', borderRadius: 'var(--radio)', padding: '18px 20px', fontSize: 16, fontWeight: 600 }}
      >
        ✅ Recibido. Te llamamos en horario de oficina — te contesta una persona, no un formulario automático.
      </div>
    )
  }

  const mal = (c: string): CSSProperties =>
    estado.fase === 'error' && estado.campo === c ? { borderColor: 'var(--danger)' } : {}

  return (
    <form onSubmit={enviar} noValidate>
      <div style={{ ...fila, marginBottom: 12 }}>
        <div>
          <label style={etiqueta} htmlFor="nombre">
            Nombre
          </label>
          <input id="nombre" name="nombre" autoComplete="given-name" style={{ ...campo, ...mal('nombre') }} />
        </div>
        <div>
          <label style={etiqueta} htmlFor="apellidos">
            Apellidos <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional)</span>
          </label>
          <input id="apellidos" name="apellidos" autoComplete="family-name" style={campo} />
        </div>
      </div>

      <div style={{ ...fila, marginBottom: 12 }}>
        <div>
          <label style={etiqueta} htmlFor="telefono">
            Teléfono
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            style={{ ...campo, ...mal('telefono') }}
          />
        </div>
        <div>
          <label style={etiqueta} htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            style={{ ...campo, ...mal('email') }}
          />
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '-2px 0 14px' }}>
        Con un teléfono o un correo nos basta; no hacen falta los dos.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={etiqueta} htmlFor="tipoSeguro">
          ¿Qué seguro quieres revisar?
        </label>
        <select id="tipoSeguro" name="tipoSeguro" defaultValue={ramoPorDefecto ?? ''} style={{ ...campo, ...mal('tipoSeguro') }}>
          <option value="">Elige una opción</option>
          {TIPOS_SEGURO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={etiqueta} htmlFor="comentario">
          Cuéntanos lo justo <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional)</span>
        </label>
        <textarea id="comentario" name="comentario" rows={3} maxLength={MAX_COMENTARIO} style={{ ...campo, minHeight: 88, resize: 'vertical' }} />
        {/* 🚨 Nada de pedir aquí datos de salud, DNI ni matrículas: es un campo
            libre de una web pública. Lo que haga falta se pide después, por el
            canal correcto. */}
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' }}>
          No hace falta que incluyas datos médicos, DNI ni matrículas: si hacen falta, te los pedimos luego por un canal seguro.
        </p>
      </div>

      {/* Honeypot: fuera de pantalla, sin tabulación y sin autocompletar. */}
      <div aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor={CAMPO_HONEYPOT}>No rellenar</label>
        <input id={CAMPO_HONEYPOT} name={CAMPO_HONEYPOT} tabIndex={-1} autoComplete="off" />
      </div>

      <label
        style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, marginBottom: 16, cursor: 'pointer' }}
      >
        <input
          type="checkbox"
          checked={consentimiento}
          onChange={(e) => setConsentimiento(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
        />
        <span>
          Acepto que <strong>Alberto Suárez Gutiérrez</strong> (Grupo ASegura) trate mis datos para responder a esta
          solicitud y prepararme un presupuesto. Puedo retirar el consentimiento cuando quiera. Más detalle en{' '}
          <Link href="/legal/privacidad">privacidad</Link> y en{' '}
          <Link href="/legal/informacion-mediador">información del mediador</Link>.
        </span>
      </label>

      {estado.fase === 'error' && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          {estado.motivo}
        </p>
      )}

      <button
        type="submit"
        disabled={estado.fase === 'enviando' || !consentimiento}
        style={{
          minHeight: 48,
          width: '100%',
          padding: '0 20px',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'inherit',
          color: '#fff',
          background: consentimiento ? 'var(--brand)' : 'var(--muted2)',
          border: 'none',
          borderRadius: 12,
          cursor: consentimiento && estado.fase !== 'enviando' ? 'pointer' : 'not-allowed',
        }}
      >
        {estado.fase === 'enviando' ? 'Enviando…' : 'Que me llamen'}
      </button>
    </form>
  )
}
