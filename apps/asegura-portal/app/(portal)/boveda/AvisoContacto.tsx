'use client'
import { useState } from 'react'
import Link from 'next/link'

import type { LecturaMisDatos } from '@/lib/mis-datos'

/**
 * «Comprueba tus datos de contacto» — el aviso AUTOMÁTICO en la pestaña
 * principal, no en «Mis datos». Dictado de Alberto (08/09/2026): «tiene que
 * ser automático, un aviso en la intranet; yo no intervengo».
 *
 * ─── Por qué esto NO enseña ni edita ningún dato ─────────────────────────────
 * Desde el 09/09/2026 la pestaña «Mis datos» ya enseña el contacto en claro y
 * deja corregirlo (`MisDatos.tsx`). Este aviso es solo el EMPUJÓN: la mayoría
 * de la gente no abre una pestaña de ajustes por su cuenta, así que el gesto
 * de un toque («Siguen igual») y el enlace a la pestaña real es lo que hace
 * que el recordatorio sirva de algo. No duplica lectura ni máscara: usa la
 * MISMA `lectura` que ya se pidió para «Mis datos» (una sola llamada al
 * puente por visita).
 *
 * ─── Los tres estados, y por qué solo dos pintan algo ────────────────────────
 * `nunca` (NULL: todo el volcado nace así) y `caducada` (>365 días) muestran el
 * aviso; `vigente` no pinta nada — repetir un aviso ya atendido es ruido. Si la
 * lectura falló (`sin_ficha`, `sin_puente`, `error`…) tampoco se pinta nada
 * AQUÍ: esta es la pestaña de las pólizas, no el sitio para explicar un fallo
 * técnico — eso ya lo dice «Mis datos» cuando la persona entra a mirarlo.
 */
export function AvisoContacto({ lectura }: { lectura: LecturaMisDatos }) {
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (lectura.estado !== 'ok') return null
  if (lectura.confirmacion === 'vigente' || confirmado) return null

  async function confirmar() {
    setEnviando(true)
    setAviso(null)
    try {
      const res = await fetch('/api/mis-datos/confirmar', { method: 'POST' })
      const j = (await res.json().catch(() => null)) as { estado?: string } | null
      if (res.ok && j?.estado === 'ok') {
        setConfirmado(true)
        return
      }
      setAviso('No hemos podido guardar la confirmación. Inténtalo de nuevo en un momento.')
    } catch {
      setAviso('No hemos podido guardar la confirmación (no hubo conexión). Inténtalo de nuevo en un momento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    // 🚨 NO lleva `acento`: esa franja tintada ya es de `Calendario` («acento
    // va SOLO aquí»), y dos secciones tintadas en la misma pestaña dejarían de
    // contrastar entre ellas. Este aviso destaca por IR PRIMERO, no por color.
    <section className="seccion" aria-labelledby="aviso-contacto-titulo">
      <p className="antetitulo">Antes de seguir</p>
      <h2 id="aviso-contacto-titulo">Comprueba tus datos de contacto</h2>
      <p className="supresion-intro">
        {lectura.confirmacion === 'nunca'
          ? 'No nos consta que hayas confirmado nunca tu teléfono, correo y dirección de contacto — muchos vienen de un volcado antiguo.'
          : 'Hace más de un año que no confirmas tu teléfono, correo y dirección de contacto.'}{' '}
        ¿Siguen siendo correctos?
      </p>
      <div className="contacto-acciones">
        <button type="button" className="boton" onClick={confirmar} disabled={enviando}>
          {enviando ? 'Guardando…' : 'Sí, siguen igual'}
        </button>
        <Link className="boton-tenue" href="/boveda?vista=datos">
          Quiero corregir algo
        </Link>
      </div>
      {aviso && <p role="status" className="mi-direccion-aviso">{aviso}</p>}
    </section>
  )
}
