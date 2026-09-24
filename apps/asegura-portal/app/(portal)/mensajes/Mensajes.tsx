'use client'
import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import { MAX_CUERPO_MENSAJE, type Hilo } from '@central/module-seguros-portal'

type PolizaOpcion = { id: string; etiqueta: string }

function cuando(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  })
}

const ERRORES: Record<string, string> = {
  invalido: 'Escribe el mensaje antes de enviarlo.',
  poliza_no_valida: 'Esa póliza no es tuya o ya no está disponible. Elige otra o escribe en «General».',
  limite_diario: 'Hoy ya nos has escrito muchos mensajes. Si es urgente, llámanos.',
  sin_ficha: 'Todavía no te tenemos identificado como cliente. Escríbenos a hola@grupoasegura.es.',
  varias_fichas: 'Tu correo aparece en más de una ficha y lo está revisando tu corredor. Mientras tanto, escríbenos a hola@grupoasegura.es.',
  modo_corredor: 'Estás viendo el portal como lo ve el cliente: desde aquí no se escribe en su nombre.',
}

/**
 * Los hilos (uno por póliza y el general) y el formulario para escribir. Tras enviar se refresca la
 * página del servidor: el mensaje que se ve es el guardado, no una copia optimista que podría no existir.
 */
export function Mensajes({
  hilos,
  polizas,
  puedeEscribir,
  noPuede,
  sinFicha,
}: {
  hilos: Hilo[]
  polizas: PolizaOpcion[]
  puedeEscribir: boolean
  noPuede: 'modo_corredor' | 'varias_fichas' | null
  sinFicha: boolean
}) {
  const router = useRouter()
  const [tema, setTema] = useState<string>('')
  const [cuerpo, setCuerpo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!cuerpo.trim()) { setAviso({ ok: false, texto: ERRORES.invalido }); return }
    setEnviando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/mensajes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId: tema || null, cuerpo }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      // 201 = guardado (la ruta solo lo da con el mensaje ya en la tabla).
      if (r.status === 201) {
        setCuerpo('')
        setAviso({ ok: true, texto: 'Enviado. Te contestamos aquí; te avisaremos cuando lo hagamos.' })
        router.refresh()
        return
      }
      setAviso({ ok: false, texto: ERRORES[j?.estado ?? ''] ?? 'No hemos podido guardar el mensaje. Inténtalo en un momento.' })
    } catch {
      setAviso({ ok: false, texto: 'No hemos podido enviarlo (no hubo conexión). Inténtalo en un momento.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <section className="seccion" aria-labelledby="escribir-titulo">
        <h2 id="escribir-titulo">Escribe a tu corredor</h2>
        {sinFicha ? (
          <p className="suave" style={{ margin: 0 }}>{ERRORES.sin_ficha}</p>
        ) : !puedeEscribir ? (
          <p className="suave" style={{ margin: 0 }}>{ERRORES[noPuede ?? 'varias_fichas']}</p>
        ) : (
          <form className="editor-form" onSubmit={enviar} noValidate>
            <div className="editor-campo">
              <label htmlFor="msg-tema">Sobre qué</label>
              <select id="msg-tema" className="campo" value={tema} onChange={(e) => setTema(e.target.value)} disabled={enviando}>
                <option value="">General</option>
                {polizas.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
            </div>
            <div className="editor-campo">
              <label htmlFor="msg-cuerpo">Tu mensaje</label>
              <textarea
                id="msg-cuerpo"
                className="campo campo-area"
                rows={4}
                maxLength={MAX_CUERPO_MENSAJE}
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                disabled={enviando}
                placeholder="Cuéntanos qué necesitas."
              />
            </div>
            <p className="suave" style={{ fontSize: 13, margin: 0 }}>
              Un siniestro NO se comunica por aquí: para eso está «Siniestros», con el teléfono de tu compañía.
            </p>
            <button type="submit" className="boton" disabled={enviando} style={{ minHeight: 44 }}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
            {aviso && <p className={aviso.ok ? 'confirmacion' : 'error-linea'} role="status">{aviso.texto}</p>}
          </form>
        )}
      </section>

      <section className="seccion" aria-labelledby="hilos-titulo">
        <h2 id="hilos-titulo">Conversaciones</h2>
        {hilos.length === 0 ? (
          <p className="suave" style={{ margin: 0 }}>Todavía no nos has escrito nada por aquí.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {hilos.map((h) => (
              <HiloPlegable key={h.polizaId ?? 'general'} abiertoDeSalida={h.sinLeer > 0}>
                <summary style={{ cursor: 'pointer', minHeight: 44, display: 'list-item' }}>
                  <strong>{h.titulo}</strong>{' '}
                  <span className="suave" style={{ fontSize: 13 }}>· {h.mensajes.length} mensaje(s) · último {cuando(h.ultimoAt)}</span>
                  {h.sinLeer > 0 && <span className="chip aviso" style={{ marginLeft: 8 }}>{h.sinLeer} nueva(s)</span>}
                </summary>
                <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'grid', gap: 8 }}>
                  {h.mensajes.map((m) => (
                    <li
                      key={m.id}
                      style={{
                        justifySelf: m.autor === 'cliente' ? 'end' : 'start',
                        maxWidth: 'min(560px, 92%)',
                        border: '1px solid var(--border)',
                        borderLeft: m.autor === 'corredor' ? '3px solid var(--brand)' : '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '8px 10px',
                        background: m.autor === 'corredor' ? 'var(--brand-soft)' : 'var(--panel)',
                      }}
                    >
                      <span className="suave" style={{ display: 'block', fontSize: 12 }}>
                        {m.autor === 'corredor' ? 'Tu corredor' : 'Tú'} · {cuando(m.creadoAt)}
                      </span>
                      <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.cuerpo}</span>
                    </li>
                  ))}
                </ol>
                {puedeEscribir && (
                  <button type="button" className="boton secundario" style={{ marginTop: 10, minHeight: 44 }} onClick={() => { setTema(h.polizaId ?? ''); document.getElementById('msg-cuerpo')?.focus() }}>
                    Responder aquí
                  </button>
                )}
              </HiloPlegable>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

/**
 * Un hilo que nace abierto si trae respuestas nuevas y DESPUÉS lo gobierna quien lo mira. Con `open`
 * atado a `sinLeer`, el refresco tras enviar (que ya ha sellado lo leído) lo cerraría con el propio
 * mensaje dentro.
 */
function HiloPlegable({ abiertoDeSalida, children }: { abiertoDeSalida: boolean; children: ReactNode }) {
  const [abierto, setAbierto] = useState(abiertoDeSalida)
  return (
    <details
      open={abierto}
      onToggle={(e) => setAbierto(e.currentTarget.open)}
      style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}
    >
      {children}
    </details>
  )
}
