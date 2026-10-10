'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Devolver a la bóveda una póliza que la persona quitó (10/10/2026).
 *
 * Sin confirmación en dos pasos, al revés que quitar: restaurar no destruye nada y se deshace
 * quitándola otra vez. `router.refresh()` para que el servidor vuelva a pintar las dos listas sin
 * desmontar la página (la fila pasa de «Eliminadas» a «Tu cartera»).
 */
export function RestaurarPoliza({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restaurar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch(`/api/polizas/${encodeURIComponent(id)}/restaurar`, { method: 'POST' })
      if (r.ok) {
        router.refresh()
        return
      }
      // 404 = ya no está en «Eliminadas» (otra pestaña la recuperó): refrescar enseña la verdad.
      if (r.status === 404) {
        router.refresh()
        return
      }
      setError('No hemos podido recuperarla. Vuelve a intentarlo y, si sigue igual, escríbenos.')
    } catch {
      // Fallo de red: NO se ha recuperado. Decir «hecho» sería afirmar algo que no ha pasado.
      setError('No hemos podido recuperarla: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <span className="eliminadas-fila-accion">
      <button
        type="button"
        className="boton-tenue"
        onClick={() => void restaurar()}
        disabled={enviando}
        aria-label={`Restaurar ${titulo} en tu bóveda`}
      >
        {enviando ? 'Restaurando…' : 'Restaurar'}
      </button>
      {error && (
        <span className="editor-error" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
