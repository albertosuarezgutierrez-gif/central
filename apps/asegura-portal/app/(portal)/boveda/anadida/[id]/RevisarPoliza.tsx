'use client'
import { useState } from 'react'

import { TEXTO_REVISION } from '@/lib/revision-poliza-texto'
import type { Punto } from '@/lib/revision-poliza'

/**
 * «Revisar mi póliza» en la ficha de una póliza APORTADA (13/10/2026). El servidor decide si se enseña y
 * si ya hay una revisión cacheada; aquí solo se pinta y se pulsa. NO se lanza sola: cuesta una llamada de IA.
 *
 * 🚨 El aviso «Orientativo, generado automáticamente. Tu corredor lo revisará contigo.» va SIEMPRE visible
 * junto a los puntos. «¿Lo vemos juntos?» reutiliza la petición de `/api/polizas/[id]/gestion` (acción
 * `pedir`) y solo dice «recibido» cuando el servidor lo confirma. Sin IA, sin datos o con el tope agotado no
 * hay botón de revisar, pero «¿Lo vemos juntos?» sigue (el corredor sí puede mirarla).
 */
export function RevisarPoliza({
  polizaId,
  disponible,
  inicial,
  pedidaInicial,
}: {
  polizaId: string
  /** Hay IA configurada (o ya hay revisión cacheada). */
  disponible: boolean
  inicial: Punto[] | null
  pedidaInicial: boolean
}) {
  const [puntos, setPuntos] = useState<Punto[] | null>(inicial)
  const [aviso, setAviso] = useState<string | null>(null)
  // Sin IA, sin datos o con el tope: la revisión automática no sale, pero el corredor sí puede mirarla.
  const [ofrecerCorredor, setOfrecerCorredor] = useState(!disponible)
  const [revisando, setRevisando] = useState(false)
  const [pedida, setPedida] = useState(pedidaInicial)
  const [pidiendo, setPidiendo] = useState(false)
  const [errorPedir, setErrorPedir] = useState<string | null>(null)
  const base = `/api/polizas/${encodeURIComponent(polizaId)}`

  async function revisar() {
    setRevisando(true)
    setAviso(null)
    try {
      const r = await fetch(`${base}/revision`, { method: 'POST' })
      const j = (await r.json().catch(() => null)) as { estado?: string; puntos?: Punto[] } | null
      if (j?.estado === 'ok' && Array.isArray(j.puntos)) setPuntos(j.puntos)
      else if (j?.estado === 'sin_ia' || j?.estado === 'sin_datos' || j?.estado === 'tope') {
        setAviso(j.estado === 'sin_ia' ? TEXTO_REVISION.sinIa : j.estado === 'sin_datos' ? TEXTO_REVISION.sinDatos : TEXTO_REVISION.tope)
        setOfrecerCorredor(true)
      } else setAviso(TEXTO_REVISION.error)
    } catch {
      setAviso(TEXTO_REVISION.error)
    } finally {
      setRevisando(false)
    }
  }

  async function pedir() {
    setPidiendo(true)
    setErrorPedir(null)
    try {
      const r = await fetch(`${base}/gestion`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'pedir' }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      if (r.ok && (j?.estado === 'pedida' || j?.estado === 'ya_pedida')) setPedida(true)
      else setErrorPedir('No hemos podido registrar tu petición. Vuelve a intentarlo en un rato.')
    } catch {
      setErrorPedir('No hemos podido registrar tu petición. Vuelve a intentarlo en un rato.')
    } finally {
      setPidiendo(false)
    }
  }

  // «¿Lo vemos juntos?»: con los puntos y también cuando la revisión automática no sale (sin IA, sin datos, tope).
  const corredor = pedida ? (
    <p className="suave" role="status">
      {TEXTO_REVISION.ctaHecha}
    </p>
  ) : (
    <>
      {errorPedir && (
        <p className="editor-error" role="alert">
          {errorPedir}
        </p>
      )}
      <button type="button" className="boton auto" onClick={() => void pedir()} disabled={pidiendo} style={{ marginTop: 10, minHeight: 44 }}>
        {pidiendo ? 'Enviando…' : TEXTO_REVISION.cta}
      </button>
    </>
  )

  return (
    <section className="seccion" aria-labelledby="revision-titulo" style={{ minWidth: 0 }}>
      <h2 id="revision-titulo">{TEXTO_REVISION.titulo}</h2>

      {puntos === null ? (
        <>
          {disponible ? (
            <>
              <p className="suave">
                Con lo que consta de esta póliza, te señalamos hasta tres puntos que merece la pena comentar.
              </p>
              {aviso && (
                <p className="editor-error" role="alert">
                  {aviso}
                </p>
              )}
              {!ofrecerCorredor && (
                <button type="button" className="boton auto" onClick={() => void revisar()} disabled={revisando} style={{ minHeight: 44 }}>
                  {revisando ? TEXTO_REVISION.revisando : TEXTO_REVISION.boton}
                </button>
              )}
            </>
          ) : (
            <p className="suave">{TEXTO_REVISION.sinIa}</p>
          )}
          {ofrecerCorredor && (
            <>
              <p className="suave">{TEXTO_REVISION.ctaInvitacion}</p>
              {corredor}
            </>
          )}
        </>
      ) : (
        <>
          <p className="suave" style={{ fontWeight: 600 }}>
            {TEXTO_REVISION.aviso}
          </p>
          {puntos.length === 0 ? (
            <p className="suave">{TEXTO_REVISION.sinPuntos}</p>
          ) : (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {puntos.map((p, i) => (
                <li key={i} className="suave" style={{ overflowWrap: 'anywhere' }}>
                  <strong>{p.titulo}</strong>
                  <br />
                  {p.detalle}
                </li>
              ))}
            </ul>
          )}
          {corredor}
        </>
      )}
    </section>
  )
}
