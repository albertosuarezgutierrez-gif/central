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
import { MEDIADOR } from '@central/module-seguros'
import { TIPOS_SEGURO, ETIQUETA_TIPO, CAMPO_HONEYPOT, MAX_COMENTARIO } from '@/lib/contrato-lead'

// El aspecto de los campos (alto táctil, anillo de foco, los 16 px exactos que
// evitan el zoom de Safari en iPhone) vive en `globals.css` como `.f-in` y
// `.f-lab`. Aquí solo queda la rejilla, que es maquetación de este formulario.
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
        className="panel panel-tinta"
        style={{ color: 'var(--brand-ink)', fontSize: 16, fontWeight: 600 }}
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
          <label className="f-lab" htmlFor="nombre">
            Nombre
          </label>
          <input id="nombre" name="nombre" autoComplete="given-name" className="f-in" style={mal('nombre')} />
        </div>
        <div>
          <label className="f-lab" htmlFor="apellidos">
            Apellidos <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional)</span>
          </label>
          <input id="apellidos" name="apellidos" autoComplete="family-name" className="f-in" />
        </div>
      </div>

      <div style={{ ...fila, marginBottom: 12 }}>
        <div>
          <label className="f-lab" htmlFor="telefono">
            Teléfono
          </label>
          <input
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="f-in" style={mal('telefono')}
          />
        </div>
        <div>
          <label className="f-lab" htmlFor="email">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="f-in" style={mal('email')}
          />
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '-2px 0 14px' }}>
        Con un teléfono o un correo nos basta; no hacen falta los dos.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label className="f-lab" htmlFor="tipoSeguro">
          ¿Qué seguro quieres revisar?
        </label>
        <select id="tipoSeguro" name="tipoSeguro" defaultValue={ramoPorDefecto ?? ''} className="f-in" style={mal('tipoSeguro')}>
          <option value="">Elige una opción</option>
          {TIPOS_SEGURO.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="f-lab" htmlFor="comentario">
          Cuéntanos lo justo <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opcional)</span>
        </label>
        <textarea id="comentario" name="comentario" rows={3} maxLength={MAX_COMENTARIO} className="f-in" />
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
          solicitud y prepararme un presupuesto. Puedo retirar el consentimiento cuando quiera.
        </span>
      </label>

      {/* 🚨 Capa 1 del art. 13 RGPD, y va AQUÍ y no solo enlazada: la
          información hay que darla «en el momento en que se obtienen los
          datos». La casilla de arriba cubría responsable y finalidad, pero no
          destinatarios, plazo, derechos ni la reclamación ante la AEPD, que
          son epígrafes obligatorios. El modelo por capas de la AEPD permite
          resumirlos en una línea cada uno; lo que no permite es omitirlos.
          Los destinatarios son el dato que más le importa a quien rellena
          esto: sus datos van a las aseguradoras a las que se pida precio. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: '0 0 16px' }}>
        <strong>Responsable:</strong> Alberto Suárez Gutiérrez (Grupo ASegura).{' '}
        <strong>Finalidad:</strong> atender tu solicitud y prepararte un presupuesto.{' '}
        <strong>Legitimación:</strong> tu consentimiento y las gestiones previas que pides con él.{' '}
        <strong>Destinatarios:</strong> las entidades aseguradoras a las que consultemos precio, y los proveedores que
        tratan datos por cuenta nuestra. <strong>Conservación:</strong> un año desde el último contacto si no llegamos a
        trabajar juntos. <strong>Derechos:</strong> acceso, rectificación, supresión, oposición, limitación y
        portabilidad escribiendo a {MEDIADOR.identidad.email}, y reclamación ante la Agencia Española de Protección de Datos.{' '}
        <Link href="/legal/privacidad">Información completa</Link> ·{' '}
        <Link href="/legal/informacion-mediador">información del mediador</Link>.
      </p>

      {estado.fase === 'error' && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          {estado.motivo}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-brand"
        disabled={estado.fase === 'enviando' || !consentimiento}
        style={{
          width: '100%',
          // Sin consentimiento el botón se apaga en vez de esconderse: que se
          // vea deshabilitado dice DÓNDE está lo que falta; ocultarlo, no.
          background: consentimiento ? undefined : 'var(--muted2)',
          boxShadow: consentimiento ? undefined : 'none',
          cursor: consentimiento && estado.fase !== 'enviando' ? 'pointer' : 'not-allowed',
        }}
      >
        {estado.fase === 'enviando' ? 'Enviando…' : 'Que me llamen'}
      </button>
    </form>
  )
}
