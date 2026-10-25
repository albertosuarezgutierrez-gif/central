'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { ERRORES_OFERTA, TEXTO_HIPOTECA, type RespuestaHipoteca } from '@/lib/patrimonio/ofertas'

import { OfertaBoton } from '../../OfertaBoton'

const OPCIONES: { valor: RespuestaHipoteca; etiqueta: string }[] = [
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
  { valor: 'no_se', etiqueta: 'No lo sé' },
]

/**
 * «¿Tiene hipoteca?»: una DECLARACIÓN del cliente (no pide nada a nadie). Solo con «Sí» aparece la tarjeta con el botón; sin
 * contestar (o «No»/«No lo sé») no se ofrece nada. `inicial` `null` = todavía no lo ha dicho.
 */
export function HipotecaInmueble({ inmuebleId, inicial }: { inmuebleId: string; inicial: RespuestaHipoteca | null }) {
  const router = useRouter()
  const [valor, setValor] = useState<RespuestaHipoteca | null>(inicial)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(nuevo: RespuestaHipoteca) {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch(`/api/patrimonio/inmuebles/${inmuebleId}/hipoteca`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ valor: nuevo }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(ERRORES_OFERTA[j.error ?? ''] ?? 'No se ha podido guardar. Inténtalo de nuevo.')
        return
      }
      setValor(nuevo)
      router.refresh()
    } catch {
      setError('No se ha podido guardar. Revisa tu conexión.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div role="group" aria-label="¿Este inmueble tiene hipoteca?" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>¿Tiene hipoteca?</span>
        {OPCIONES.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={valor === o.valor ? 'boton' : 'boton-secundario'}
            style={{ minHeight: 44 }}
            aria-pressed={valor === o.valor}
            disabled={enviando}
            onClick={() => guardar(o.valor)}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {valor === null && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Todavía no nos lo has dicho.</p>}
      {error && <p role="alert" className="error" style={{ margin: 0 }}>{error}</p>}
      {valor === 'si' && (
        <OfertaBoton
          tipo="hipoteca"
          objeto={{ inmuebleId }}
          titulo={TEXTO_HIPOTECA}
          texto="Si quieres, revisamos los seguros de hogar y vida ligados a tu hipoteca."
          boton="Revisar mis seguros de la hipoteca"
        />
      )}
    </div>
  )
}
