'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'
import type { EscrituraBackfillDni } from '@/lib/correduria-puerto'

/**
 * El botón que escribe el índice de búsqueda por DNI (paso 3 del backfill).
 *
 * 🚨 Existe desde el 05/09/2026 porque hasta ese día NO HABÍA NINGUNO. La
 * pantalla calculaba el plan y decía «se lanza desde asegura»; en la práctica
 * eso era un `curl` con `ASEGURA_OPERADOR_SECRET` a mano, o sea que «haz el
 * backfill del DNI» no lo podía hacer nadie desde ninguna pantalla.
 *
 * Va en tandas a propósito: el endpoint de asegura descifra las ~32.000 fichas
 * antes de escribir nada, y eso ya consume parte de sus 300 s. Cada pulsación
 * devuelve cuántas quedan, y se repite hasta 0. Es idempotente (sólo toca
 * fichas con el hash a NULL), así que pulsar de más no rompe nada.
 *
 * Y los tres estados de siempre en el resultado: si la conexión se corta, eso NO
 * es «no se ha escrito nada» — la escritura del otro lado puede haber terminado.
 * Se dice tal cual y se invita a recargar, que es lo único que sabe la verdad.
 */
export default function EscribirIndiceDni({ pendientes }: { pendientes: number }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [r, setR] = useState<EscrituraBackfillDni | null>(null)

  async function escribir() {
    setEnviando(true)
    setR(null)
    try {
      const res = await fetch('/api/correduria/backfill-dni', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limite: TANDA }),
      })
      const json = (await res.json().catch(() => null)) as EscrituraBackfillDni | null
      setR(json ?? { estado: 'error', motivo: `respuesta ${res.status}` })
      router.refresh()
    } catch {
      setR({
        estado: 'error',
        motivo: 'se cortó la conexión antes de recibir el resultado — recarga la página para ver cuánto se escribió',
      })
    } finally {
      setEnviando(false)
    }
  }

  if (pendientes === 0 && r === null) return null

  return (
    <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
      <button style={btnStyle('primario')} onClick={escribir} disabled={enviando}>
        {enviando ? 'Escribiendo…' : `Escribir ${Math.min(pendientes, TANDA).toLocaleString('es-ES')} índices`}
      </button>
      {enviando && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          Puede tardar un par de minutos: antes de escribir hay que descifrar el DNI de las {' '}
          32.000 fichas para saber cuál va en cada una.
        </p>
      )}
      {r !== null && <Resultado r={r} />}
    </div>
  )
}

/**
 * Cuántas por pulsación. No es un tope de seguridad —la escritura es
 * idempotente— sino de reloj: sin él, una cartera grande se come los 300 s
 * descifrando y escribiendo, y el resultado se pierde en un timeout.
 */
const TANDA = 8000

function Resultado({ r }: { r: EscrituraBackfillDni }) {
  if (r.estado === 'sin_configurar') {
    return <Nota>No se ha podido lanzar: falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</Nota>
  }
  if (r.estado === 'error') {
    return <Nota alerta>No se ha podido completar: {r.motivo}</Nota>
  }
  return (
    <Nota>
      ✅ Escritos <strong>{r.escritos.toLocaleString('es-ES')}</strong> índices.{' '}
      {r.restantes > 0
        ? `Quedan ${r.restantes.toLocaleString('es-ES')}: vuelve a pulsar.`
        : 'No queda ninguno pendiente.'}
      {r.fallidos > 0 && (
        <>
          {' '}
          <strong>{r.fallidos}</strong> las rechazó la base pese a entrar en el plan (otra escritura se
          adelantó). Vuelve a pulsar y, si siguen, hay que mirarlas.
        </>
      )}
    </Nota>
  )
}

function Nota({ children, alerta }: { children: React.ReactNode; alerta?: boolean }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: alerta ? 'var(--warning)' : undefined }}>{children}</p>
  )
}
