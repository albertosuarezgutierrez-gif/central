'use client'
// Formulario del canal de leads web (client). Envía a `/api/publico/correduria/lead`
// y enseña UNA de tres cosas: enviando · recibido · el motivo por el que no vale.
// El campo `web` es el honeypot: oculto para personas (fuera de pantalla, sin tab,
// sin autocompletar); un bot que lo rellene recibe «recibido» y no pasa nada.
import { useState, type CSSProperties, type FormEvent } from 'react'
import { TIPOS_SEGURO_LEAD, ETIQUETA_TIPO_SEGURO, MAX_COMENTARIO, CAMPO_HONEYPOT } from '@/lib/leads-web'

const campo: CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '10px 12px', fontSize: 16,
  border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)',
}
const etiqueta: CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }

type Estado = { fase: 'idle' } | { fase: 'enviando' } | { fase: 'ok' } | { fase: 'error'; motivo: string; campo: string | null }

export default function Formulario() {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' })
  const [consentimiento, setConsentimiento] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (estado.fase === 'enviando') return
    const fd = new FormData(e.currentTarget)
    const cuerpo = {
      nombre: fd.get('nombre'),
      apellidos: fd.get('apellidos'),
      telefono: fd.get('telefono'),
      email: fd.get('email'),
      tipoSeguro: fd.get('tipoSeguro'),
      comentario: fd.get('comentario'),
      consentimiento,
      [CAMPO_HONEYPOT]: fd.get(CAMPO_HONEYPOT),
    }
    setEstado({ fase: 'enviando' })
    try {
      const res = await fetch('/api/publico/correduria/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; motivo?: string; campo?: string | null }
      if (res.ok && json.ok) setEstado({ fase: 'ok' })
      else setEstado({ fase: 'error', motivo: json.motivo || 'No se ha podido enviar. Inténtalo de nuevo.', campo: json.campo ?? null })
    } catch {
      setEstado({ fase: 'error', motivo: 'Sin conexión. Inténtalo de nuevo.', campo: null })
    }
  }

  if (estado.fase === 'ok') {
    return (
      <div role="status" style={{ background: 'var(--positive-bg)', color: 'var(--positive)', borderRadius: 10, padding: '14px 16px', fontSize: 16, fontWeight: 600 }}>
        ✅ Recibido. Te llamamos en horario de oficina.
      </div>
    )
  }

  const mal = (c: string) => estado.fase === 'error' && estado.campo === c ? { borderColor: 'var(--negative)' } : {}

  return (
    <form onSubmit={enviar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div>
          <label htmlFor="lead-nombre" style={etiqueta}>Nombre *</label>
          <input id="lead-nombre" name="nombre" required maxLength={255} autoComplete="given-name" style={{ ...campo, ...mal('nombre') }} />
        </div>
        <div>
          <label htmlFor="lead-apellidos" style={etiqueta}>Apellidos</label>
          <input id="lead-apellidos" name="apellidos" maxLength={255} autoComplete="family-name" style={{ ...campo, ...mal('apellidos') }} />
        </div>
        <div>
          <label htmlFor="lead-telefono" style={etiqueta}>Teléfono</label>
          <input id="lead-telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" style={{ ...campo, ...mal('telefono') }} />
        </div>
        <div>
          <label htmlFor="lead-email" style={etiqueta}>Email</label>
          <input id="lead-email" name="email" type="email" inputMode="email" autoComplete="email" style={{ ...campo, ...mal('email') }} />
        </div>
      </div>

      <div>
        <label htmlFor="lead-tipo" style={etiqueta}>¿Qué seguro te interesa? *</label>
        <select id="lead-tipo" name="tipoSeguro" defaultValue="auto" style={{ ...campo, ...mal('tipoSeguro') }}>
          {TIPOS_SEGURO_LEAD.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_SEGURO[t]}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="lead-comentario" style={etiqueta}>Cuéntanos qué necesitas</label>
        <textarea
          id="lead-comentario" name="comentario" rows={4} maxLength={MAX_COMENTARIO}
          placeholder="Marca y modelo del coche, dirección de la vivienda, cuándo te vence el seguro actual…"
          style={{ ...campo, resize: 'vertical', ...mal('comentario') }}
        />
      </div>

      {/* Honeypot: fuera de pantalla, sin tab, sin autocompletar. No es un campo para personas. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="lead-web">Web</label>
        <input id="lead-web" name={CAMPO_HONEYPOT} type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: 'var(--muted)', cursor: 'pointer', ...(estado.fase === 'error' && estado.campo === 'consentimiento' ? { color: 'var(--negative)' } : {}) }}>
        <input
          type="checkbox" name="consentimiento" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)}
          style={{ width: 22, height: 22, marginTop: 1, flexShrink: 0 }}
        />
        <span>
          Acepto que <strong>Grupo Asegura</strong> (responsable del tratamiento) use estos datos con la finalidad de
          atender mi solicitud y contactar conmigo. Puedo ejercer mis derechos de acceso, rectificación, supresión,
          oposición, limitación y portabilidad dirigiéndome a la correduría. Más información al contactar. *
        </span>
      </label>

      {estado.fase === 'error' && (
        <div role="alert" style={{ background: 'var(--negative-bg)', color: 'var(--negative)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
          {estado.motivo}
        </div>
      )}

      <button
        type="submit" disabled={estado.fase === 'enviando'}
        style={{
          minHeight: 48, padding: '12px 18px', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 10,
          background: 'var(--primary)', color: '#fff', cursor: estado.fase === 'enviando' ? 'wait' : 'pointer',
          opacity: estado.fase === 'enviando' ? 0.7 : 1,
        }}
      >
        {estado.fase === 'enviando' ? 'Enviando…' : 'Quiero que me llaméis'}
      </button>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>* Obligatorio. Con teléfono o email nos basta.</p>
    </form>
  )
}
