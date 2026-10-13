'use client'
import { useCallback, useEffect, useState } from 'react'

import { textoCompartirFamilia } from '@/lib/invitar-familia'

/**
 * «Invitar a tu familia». Genera un enlace personal y lo comparte con el menú del móvil (Web Share API) o, si
 * el navegador no lo tiene, lo copia. Texto neutro: sin premios ni argumento comercial (art. 21 LSSI).
 * Muestra solo CIFRAS (enviadas / aceptadas), nunca a quién.
 */
const TEXTO = textoCompartirFamilia()

export function InvitarFamilia() {
  const [resumen, setResumen] = useState<{ enviadas: number; aceptadas: number } | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'ojo'; texto: string } | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/invitaciones/familia', { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as { enviadas?: unknown; aceptadas?: unknown }
      if (typeof j.enviadas === 'number' && typeof j.aceptadas === 'number') setResumen({ enviadas: j.enviadas, aceptadas: j.aceptadas })
    } catch {
      // Sin cifras no se pinta un «0»: se deja sin mostrar.
    }
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  async function compartir() {
    setTrabajando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/invitaciones/familia', { method: 'POST' })
      const j = (await r.json().catch(() => null)) as { enlace?: unknown; mensaje?: unknown } | null
      if (!r.ok || typeof j?.enlace !== 'string') {
        setAviso({ tono: 'ojo', texto: typeof j?.mensaje === 'string' ? j.mensaje : 'No hemos podido crear el enlace. Inténtalo en un momento.' })
        return
      }
      const enlace = j.enlace
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ ...TEXTO, url: enlace })
          setAviso({ tono: 'ok', texto: 'Enlace listo para compartir.' })
        } catch (e) {
          // Cerrar el menú de compartir no es un error.
          if (!(e instanceof DOMException && e.name === 'AbortError')) setAviso({ tono: 'ojo', texto: 'No se ha podido abrir el menú de compartir.' })
        }
      } else {
        try {
          await navigator.clipboard.writeText(enlace)
          setAviso({ tono: 'ok', texto: 'Enlace copiado. Pégalo donde quieras.' })
        } catch {
          setAviso({ tono: 'ojo', texto: `Copia este enlace: ${enlace}` })
        }
      }
      await cargar()
    } catch {
      setAviso({ tono: 'ojo', texto: 'Comprueba tu conexión e inténtalo otra vez.' })
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section className="seccion" aria-labelledby="invitar-familia-t">
      <h2 id="invitar-familia-t" style={{ marginTop: 0 }}>Invitar a tu familia</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        Comparte un enlace personal para presentarles el portal. No les da acceso a tus seguros ni a ningún dato
        tuyo: cada persona entra con su propio correo.
      </p>
      <button type="button" className="boton" onClick={() => void compartir()} disabled={trabajando} style={{ minHeight: 44, maxWidth: '100%' }}>
        {trabajando ? 'Preparando…' : 'Compartir enlace'}
      </button>
      {aviso && (
        <p role="status" className={aviso.tono === 'ojo' ? 'editor-error' : 'suave'} style={{ overflowWrap: 'anywhere' }}>
          {aviso.texto}
        </p>
      )}
      {resumen && (
        <p className="suave" style={{ marginBottom: 0 }}>
          Invitaciones enviadas: <strong>{resumen.enviadas}</strong> · Aceptadas: <strong>{resumen.aceptadas}</strong>
        </p>
      )}
    </section>
  )
}
