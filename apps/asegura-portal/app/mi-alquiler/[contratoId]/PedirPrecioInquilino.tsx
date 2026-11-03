'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ETIQUETA_QUE_PIDE, MAX_NOMBRE_INQUILINO, QUE_PIDE_INQUILINO, type CanalInquilino, type QuePideInquilino } from '@/lib/inquilino/precio-inquilino-textos'

export type ResponsableTratamiento = { marca: string; nombre: string; figura: string; claveDgsfp: string; email: string }

type Casilla = { estado: 'concedido' | 'retirado' | 'version_antigua' | 'sin_decidir'; version: string; texto: string }

const ERRORES: Record<string, string> = {
  demasiadas_peticiones: 'Ya lo has intentado varias veces seguidas. Espera un rato.',
  texto_cambiado: 'El texto de la casilla de ofertas ha cambiado. Recarga la página y vuelve a mirarlo.',
  sin_puente: 'Ahora mismo no podemos recibir tu petición. Inténtalo más tarde.',
  puente_fallido: 'No hemos podido registrar tu petición. Inténtalo otra vez en unos minutos.',
}

const fechaEs = (f: string) => f.split('-').reverse().join('/')

/**
 * «¿Quieres precio de un seguro para tus cosas y tu responsabilidad civil?» (27/10/2026). Pantalla breve dentro de «Mi alquiler».
 * 🚨 Dos gestos distintos: PEDIR precio (petición del interesado, solo para contestarle) y la casilla APARTE de ofertas
 * (consentimiento comercial, opcional y SIN premarcar: su estado inicial es `false` siempre). Desmarcada no escribe nada.
 */
export function PedirPrecioInquilino({ contratoId, casilla, responsable }: { contratoId: string; casilla: Casilla; responsable: ResponsableTratamiento }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [que, setQue] = useState<QuePideInquilino>('ambos')
  const [nombre, setNombre] = useState('')
  const [canal, setCanal] = useState<CanalInquilino>('correo')
  const [contacto, setContacto] = useState('')
  // 🚨 NUNCA premarcada: arranca en false aunque ya hubiera un «sí» (en ese caso ni se pinta).
  const [ofertas, setOfertas] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ pedidoEl: string; yaExistia: boolean; ofertas: string } | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true)
    setError(null)
    try {
      const r = await fetch(`/api/inquilino/${contratoId}/pedir-precio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ que, nombre, canal, contacto, ofertas, versionOfertas: casilla.version }),
      })
      const j = (await r.json().catch(() => null)) as { error?: string; motivo?: string; pedidoEl?: string; yaExistia?: boolean; ofertas?: string } | null
      if (r.ok && j?.pedidoEl) {
        setHecho({ pedidoEl: j.pedidoEl, yaExistia: j.yaExistia === true, ofertas: j.ofertas ?? 'no_marcada' })
        if (j.ofertas === 'guardada') router.refresh()
        return
      }
      setError(j?.motivo ?? ERRORES[j?.error ?? ''] ?? 'No hemos podido registrar tu petición. Revisa los datos e inténtalo otra vez.')
    } catch {
      setError('No hemos podido enviarlo: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  if (hecho) {
    return (
      <section className="seccion" aria-live="polite">
        <h2 style={{ marginTop: 0 }}>Precio de un seguro para ti</h2>
        <p style={{ marginTop: 0 }}>
          {hecho.yaExistia
            ? `Ya nos lo pediste el ${fechaEs(hecho.pedidoEl)}. Te contestaremos por la vía que nos dijiste.`
            : 'Recibido. Te contestaremos por la vía que nos has dicho para darte precio.'}{' '}
          Tu propietario no sabe que lo has pedido.
        </p>
        {hecho.ofertas === 'guardada' && <p className="suave">También hemos guardado que quieres recibir otras ofertas. Puedes retirarlo abajo.</p>}
        {hecho.ofertas === 'no_guardada' && (
          <p className="suave">No hemos podido guardar la casilla de ofertas: si la quieres, márcala abajo en «Ofertas de seguros».</p>
        )}
      </section>
    )
  }

  if (!abierto) {
    return (
      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Precio de un seguro para ti</h2>
        <button type="button" onClick={() => setAbierto(true)} style={{ minHeight: 44, width: '100%', maxWidth: 520, textAlign: 'left', whiteSpace: 'normal' }}>
          ¿Quieres precio de un seguro para tus cosas y tu responsabilidad civil?
        </button>
      </section>
    )
  }

  const campo: React.CSSProperties = { display: 'block', width: '100%', maxWidth: 420, minHeight: 44, boxSizing: 'border-box' }
  return (
    <section className="seccion">
      <h2 style={{ marginTop: 0 }}>Precio de un seguro para ti</h2>
      <form onSubmit={enviar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>¿Qué quieres asegurar?</legend>
          {QUE_PIDE_INQUILINO.map((q) => (
            <label key={q} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
              <input type="radio" name="que" value={q} checked={que === q} onChange={() => setQue(q)} style={{ width: 20, height: 20 }} />
              <span>{ETIQUETA_QUE_PIDE[q]}</span>
            </label>
          ))}
        </fieldset>

        <label>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Tu nombre</span>
          <input required maxLength={MAX_NOMBRE_INQUILINO} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} style={campo} />
        </label>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>¿Cómo prefieres que te contestemos?</legend>
          {(['correo', 'telefono'] as const).map((c) => (
            <label key={c} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
              <input type="radio" name="canal" value={c} checked={canal === c} onChange={() => setCanal(c)} style={{ width: 20, height: 20 }} />
              <span>{c === 'correo' ? 'Por correo' : 'Por teléfono'}</span>
            </label>
          ))}
          <input
            required
            aria-label={canal === 'correo' ? 'Tu correo' : 'Tu teléfono'}
            type={canal === 'correo' ? 'email' : 'tel'}
            autoComplete={canal === 'correo' ? 'email' : 'tel'}
            inputMode={canal === 'correo' ? 'email' : 'tel'}
            placeholder={canal === 'correo' ? 'tu@correo.es' : '600 000 000'}
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            style={campo}
          />
          <span className="suave" style={{ fontSize: 14 }}>
            Escríbelo aunque sea el mismo con el que entras: el correo de acceso no lo guardamos de forma que podamos leerlo.
          </span>
        </fieldset>

        <div className="suave" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
          <p style={{ margin: '0 0 6px' }}>
            <strong>Quién trata estos datos:</strong> {responsable.nombre}, {responsable.figura.toLowerCase()}, clave DGSFP{' '}
            {responsable.claveDgsfp} ({responsable.marca}). Contacto: {responsable.email}.
          </p>
          <p style={{ margin: '0 0 6px' }}>
            <strong>Para qué:</strong> solo para contestar a esta petición de precio. Lo pides tú, antes de contratar nada
            (medidas precontractuales a petición del interesado, art. 6.1.b RGPD). Guardamos lo que pides, tu nombre y este
            contacto en la ficha de la correduría.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Tu propietario no ve</strong> que lo has pedido. Más información en la{' '}
            <Link href="/legal/privacidad#inquilino">política de privacidad</Link>.
          </p>
        </div>

        {casilla.estado === 'concedido' ? (
          <p className="suave" style={{ margin: 0 }}>Ya nos has dicho que quieres recibir otras ofertas. Puedes retirarlo abajo, en «Ofertas de seguros».</p>
        ) : (
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
            <input type="checkbox" checked={ofertas} onChange={(e) => setOfertas(e.target.checked)} style={{ marginTop: 4, width: 20, height: 20, flex: '0 0 auto' }} />
            <span style={{ overflowWrap: 'anywhere' }}>
              <span className="suave" style={{ display: 'block', fontSize: 14 }}>Opcional, aparte de tu petición:</span>
              {casilla.texto}
            </span>
          </label>
        )}

        {error && (
          <p role="alert" style={{ margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" disabled={ocupado} style={{ minHeight: 44 }}>
            {ocupado ? 'Enviando…' : 'Pedir precio'}
          </button>
          <button type="button" onClick={() => setAbierto(false)} disabled={ocupado} style={{ minHeight: 44 }}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}
