'use client'
// Canje de la llave del correo: confirmar el aviso o darse de baja. La llave va en el fragmento
// (`#t=…`) y se manda por POST al montar: el fragmento no viaja en la petición de la página, así
// que no queda en ningún log de acceso.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { llamarAviso, tokenDelFragmento } from '@/lib/aviso'
import { PORTAL_URL } from '@/lib/sitio'

type Fase = 'cargando' | 'ok' | 'sin_token' | 'error'

const TEXTOS = {
  confirmar: {
    ok: 'Listo: tu correo está confirmado. Te escribiremos a 70 y a 45 días del vencimiento, antes de que se cierre el plazo para decidir si renuevas.',
    error: 'El enlace no es válido o ha caducado (vale 72 horas). Puedes volver a pedirlo desde la página de tu seguro.',
  },
  baja: {
    ok: 'Hecho: no te enviaremos más avisos de vencimiento.',
    error: 'No hemos podido procesarlo.',
  },
} as const

export default function CanjeAviso({ accion }: { accion: 'confirmar' | 'baja' }) {
  const [fase, setFase] = useState<Fase>('cargando')
  const [motivo, setMotivo] = useState<string | null>(null)

  useEffect(() => {
    const token = tokenDelFragmento(window.location.hash)
    if (!token) {
      setFase('sin_token')
      return
    }
    // Se borra el fragmento de la barra: la llave no se queda en el historial ni en una captura.
    history.replaceState(null, '', window.location.pathname)
    llamarAviso(accion, { token }).then((r) => {
      setMotivo(r.motivo)
      setFase(r.ok ? 'ok' : 'error')
    })
  }, [accion])

  return (
    <div aria-live="polite" className="panel" style={{ maxWidth: 640 }}>
      {fase === 'cargando' && <p>Un momento…</p>}
      {fase === 'sin_token' && <p>Este enlace está incompleto. Ábrelo directamente desde el correo que te enviamos.</p>}
      {fase === 'error' && <p role="alert">{motivo ?? TEXTOS[accion].error}</p>}
      {fase === 'ok' && (
        <>
          <p style={{ fontSize: 17 }}>{TEXTOS[accion].ok}</p>
          {accion === 'confirmar' && (
            <p className="tenue">
              Mientras tanto, si subes tu póliza a <a href={PORTAL_URL}>tu área</a> la tienes a mano con
              la fecha al lado.
            </p>
          )}
        </>
      )}
      <p style={{ marginTop: 20 }}>
        <Link href="/">Volver a la web</Link>
      </p>
    </div>
  )
}
