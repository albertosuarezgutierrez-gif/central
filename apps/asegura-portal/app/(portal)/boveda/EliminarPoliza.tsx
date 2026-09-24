'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Quitar de la bóveda una póliza que aportó el propio cliente.
 *
 * 🚨 Este botón NO existe en la ficha de una póliza de la CARTERA, y no es un
 * olvido: lo que entra por CIMA es el registro de la correduría y el cliente no
 * lo borra. Lo suyo sí (Alberto, 07/09/2026: «las que no son nuestras el
 * cliente sí puede, que se puede confundir»): una póliza que subió mal, o que
 * ya no tiene, ensucia la única lista donde mira qué está asegurado.
 *
 * Va en la FICHA y no en la fila de la lista, a propósito: en una lista que se
 * recorre con el pulgar, un borrado a un toque de distancia se pulsa sin
 * querer. Aquí hay que entrar, y encima confirmar.
 *
 * La confirmación es en DOS pasos y en la propia página —ni `confirm()` del
 * navegador ni modal—: `confirm()` no se puede leer con lector de pantalla como
 * parte del flujo, se puede bloquear, y en móvil aparece pegado arriba, lejos
 * del dedo. Mismo patrón que revocar una autorización.
 */
export function EliminarPoliza({
  id,
  titulo,
  avisoPartes,
}: {
  id: string
  titulo: string
  /**
   * Qué pasa con los partes de siniestro que colgaban de esta póliza, cuando los
   * hay. Lo compone el servidor con `avisoPartesConservados()` y `null` es «no
   * tenía ninguno». No es decoración: sin esta frase, quien declaró un siniestro
   * puede creer que al quitar la póliza retira también el parte — que es justo
   * lo contrario de lo que hace el botón.
   */
  avisoPartes: string | null
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function eliminar() {
    setBorrando(true)
    setError(null)
    try {
      const r = await fetch(`/api/polizas/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (r.ok) {
        // A la lista, y `refresh()` para que el servidor la vuelva a pintar sin
        // la fila: sin él la bóveda se serviría de la caché del router y la
        // póliza borrada seguiría ahí, que es indistinguible de «no se ha
        // borrado».
        router.push('/boveda')
        router.refresh()
        return
      }
      const cuerpo = (await r.json().catch(() => null)) as { mensaje?: unknown } | null
      // El servidor manda el motivo REAL cuando lo hay (un parte de siniestro
      // que quedaría huérfano). Solo se inventa texto cuando no vino ninguno.
      setError(
        typeof cuerpo?.mensaje === 'string' && cuerpo.mensaje.trim() !== ''
          ? cuerpo.mensaje
          : 'No hemos podido quitarla. Vuelve a intentarlo y, si sigue igual, escríbenos.',
      )
    } catch {
      // Fallo de red: la póliza NO se ha borrado. Decir «hecho» aquí sería
      // afirmar algo que no ha pasado.
      setError('No hemos podido quitarla: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <>
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}

      {!confirmando && (
        <button type="button" className="boton-tenue" onClick={() => setConfirmando(true)}>
          Quitarla de mi bóveda
        </button>
      )}

      {confirmando && (
        <div className="aviso-linea">
          <strong>¿Quitas {titulo} de tu bóveda?</strong> Se borran los datos que nos diste de ella y no
          la vas a poder recuperar. Esto no cancela el seguro: si lo tienes contratado, sigue en vigor
          con su compañía.
          {avisoPartes && <span className="linea">{avisoPartes}</span>}
          <div className="editor-acciones" style={{ marginTop: 10 }}>
            <button type="button" className="boton" onClick={() => void eliminar()} disabled={borrando}>
              {borrando ? 'Quitando…' : 'Sí, quitarla'}
            </button>
            <button
              type="button"
              className="boton secundario"
              onClick={() => setConfirmando(false)}
              disabled={borrando}
            >
              No, dejarla
            </button>
          </div>
        </div>
      )}
    </>
  )
}
