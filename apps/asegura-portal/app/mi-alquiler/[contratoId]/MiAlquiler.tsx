'use client'
import { useRef, useState } from 'react'

export type DatosMiAlquiler = {
  vista: {
    contacto: string
    inmueble: string | null
    inicio: string
    fin: string | null
    terminadoEn: string | null
    rentaMensualCent: number | null
    seguro: { exigido: boolean | null; venceRecibo: string | null } | null
    recibos: Array<{ id: string; nombre: string; creadoEn: string }>
  }
  justificantes: Array<{ id: string; nombre: string; creadoEn: string }>
  consentimiento: { estado: 'concedido' | 'retirado' | 'version_antigua' | 'sin_decidir'; version: string; texto: string }
}

const ERRORES: Record<string, string> = {
  fichero_grande: 'El fichero pesa más de 10 MB.',
  formato_no_admitido: 'Solo se admiten PDF, JPG, PNG o WebP.',
  tope_diario: 'Has subido ya varios ficheros hoy. Prueba mañana.',
  demasiadas_peticiones: 'Demasiados intentos seguidos. Espera un rato.',
}

/** Recibos compartidos, subida de justificantes, consentimiento opcional y dejar de ver el contrato. */
export function MiAlquiler({ contratoId, datos }: { contratoId: string; datos: DatosMiAlquiler }) {
  const base = `/api/inquilino/${contratoId}`
  const input = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // Sin casilla premarcada: solo concedido de la versión actual se pinta como marcado.
  const [consiente, setConsiente] = useState(datos.consentimiento.estado === 'concedido')
  const [confirmarSalida, setConfirmarSalida] = useState(false)

  async function subir() {
    const f = input.current?.files?.[0]
    if (!f) return setMensaje('Elige un fichero.')
    setOcupado(true)
    setMensaje(null)
    try {
      const form = new FormData()
      form.set('fichero', f)
      const r = await fetch(`${base}/justificantes`, { method: 'POST', body: form })
      if (r.ok) return window.location.reload()
      const j = (await r.json().catch(() => null)) as { error?: string } | null
      setMensaje(ERRORES[j?.error ?? ''] ?? 'No hemos podido subirlo. Inténtalo otra vez.')
    } catch {
      setMensaje('No hemos podido subirlo: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  async function guardarConsentimiento(concedido: boolean) {
    setOcupado(true)
    setMensaje(null)
    try {
      const r = await fetch(`${base}/consentimiento`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ concedido, version: datos.consentimiento.version }),
      })
      if (r.ok) {
        setConsiente(concedido)
        setMensaje(concedido ? 'Guardado. Puedes retirarlo cuando quieras.' : 'Retirado. No te mostraremos ofertas.')
      } else {
        setMensaje('No hemos podido guardarlo. Inténtalo otra vez.')
      }
    } catch {
      setMensaje('No hemos podido guardarlo: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  async function dejarDeVer() {
    setOcupado(true)
    try {
      const r = await fetch(`${base}/revocar`, { method: 'POST' })
      if (r.ok) return window.location.assign('/mi-alquiler')
      setMensaje('No hemos podido hacerlo. Inténtalo otra vez.')
    } catch {
      setMensaje('No hemos podido hacerlo: comprueba tu conexión.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Recibos</h2>
        {datos.vista.recibos.length === 0 ? (
          <p className="suave">Tu propietario todavía no ha compartido ningún recibo contigo.</p>
        ) : (
          <ul style={{ paddingLeft: 18, display: 'grid', gap: 8, margin: 0 }}>
            {datos.vista.recibos.map((r) => (
              <li key={r.id} style={{ overflowWrap: 'anywhere' }}>
                <a href={`${base}/documento/${r.id}`}>{r.nombre}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Tus justificantes</h2>
        <p className="suave" style={{ marginTop: 0 }}>
          Sube aquí, por ejemplo, el recibo de tu seguro de hogar. Los verá tu propietario. PDF, JPG, PNG o WebP, hasta 10 MB.
        </p>
        {datos.justificantes.length > 0 && (
          <ul style={{ paddingLeft: 18, display: 'grid', gap: 8 }}>
            {datos.justificantes.map((j) => (
              <li key={j.id} style={{ overflowWrap: 'anywhere' }}>
                <a href={`${base}/documento/${j.id}`}>{j.nombre}</a>
              </li>
            ))}
          </ul>
        )}
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" aria-label="Fichero del justificante" />
        <div>
          <button type="button" onClick={subir} disabled={ocupado} style={{ minHeight: 44, marginTop: 8 }}>
            Subir justificante
          </button>
        </div>
      </section>

      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Ofertas de seguros (opcional)</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
          <input
            type="checkbox"
            checked={consiente}
            disabled={ocupado}
            onChange={(e) => guardarConsentimiento(e.target.checked)}
            style={{ marginTop: 4, width: 20, height: 20 }}
          />
          <span style={{ overflowWrap: 'anywhere' }}>{datos.consentimiento.texto}</span>
        </label>
        {datos.consentimiento.estado === 'version_antigua' && (
          <p className="suave">El texto ha cambiado desde la última vez: si quieres ofertas, vuelve a marcarlo.</p>
        )}
      </section>

      <section className="seccion">
        <h2 style={{ marginTop: 0 }}>Dejar de ver este contrato</h2>
        {confirmarSalida ? (
          <>
            <p style={{ marginTop: 0 }}>Dejarás de ver este contrato. Para volver, tu propietario tendrá que darte un enlace nuevo.</p>
            <button type="button" onClick={dejarDeVer} disabled={ocupado} style={{ minHeight: 44 }}>
              Sí, dejar de verlo
            </button>{' '}
            <button type="button" onClick={() => setConfirmarSalida(false)} style={{ minHeight: 44 }}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmarSalida(true)} style={{ minHeight: 44 }}>
            Dejar de ver este contrato
          </button>
        )}
      </section>

      {mensaje && (
        <p role="status" style={{ margin: 0 }}>
          {mensaje}
        </p>
      )}
    </>
  )
}
