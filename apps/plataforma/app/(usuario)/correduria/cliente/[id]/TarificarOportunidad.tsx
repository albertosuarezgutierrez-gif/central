'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { rutaPedirPrecio } from '../../oportunidad/[id]/cotizador-embebido'
import type { DestinoTarificar } from '@/lib/correduria/tarificar-oportunidad'

/**
 * «Tarificar →» en la tarjeta de Oportunidades (07/10/2026). SOLO abre la pantalla de precio del ramo
 * (`rutaPedirPrecio`: auto y moto, la propia oportunidad en «Pedir precio»; el resto, `…-nuevo?oportunidad=`), donde se confirma y se paga: este botón nunca cotiza. Si la póliza no tiene
 * seguimiento, antes lo abre (gratis). Ramo sin tarifa: no hay pantalla de precio y, con `riesgoHref`, el botón
 * pasa a ser «Ver riesgo →» (si no, deshabilitado con motivo). Con tarifa, el acceso al riesgo lo da el
 * enlace secundario «Ver riesgo →» de la fila (OportunidadesCliente), no este botón.
 */
export const ROTULO_TARIFICAR = 'Tarificar →'

export default function TarificarOportunidad({ destino, tomadorId, riesgoHref }: {
  destino: DestinoTarificar; tomadorId: string
  /** Pantalla del riesgo: solo para un ramo sin tarifa (destino 'no'), que si no se quedaría sin acceso a él. */
  riesgoHref?: string
}) {
  const router = useRouter()
  const idMotivo = useId()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estilo = { ...btnStyle('primario', 'sm'), minHeight: 44 }

  if (destino.tipo === 'enlace') {
    return <Link href={destino.href} prefetch={false} style={{ ...estilo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{ROTULO_TARIFICAR}</Link>
  }
  if (destino.tipo === 'no') {
    if (riesgoHref) {
      return <Link href={riesgoHref} prefetch={false} style={{ ...estilo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Ver riesgo →</Link>
    }
    return (
      <span style={{ display: 'grid', gap: 2, flexBasis: '100%' }}>
        <button type="button" disabled aria-describedby={idMotivo} style={estilo}>{ROTULO_TARIFICAR}</button>
        <span id={idMotivo} style={{ fontSize: 12, color: 'var(--muted)' }}>{destino.motivo}</span>
      </span>
    )
  }
  async function abrir() {
    if (destino.tipo !== 'abrir-y-enlazar' || ocupado) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad/de-poliza', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ polizaId: destino.polizaId }) })
      const json = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; oportunidadId?: string } | null
      if (!r.ok || json?.estado !== 'ok' || !json.oportunidadId) { setError(`No se ha podido abrir su seguimiento: ${json?.motivo ?? `HTTP ${r.status}`}`); setOcupado(false); return }
      router.push(rutaPedirPrecio(destino.ramo, tomadorId, json.oportunidadId))
    } catch {
      setError('Sin conexión: no se ha abierto nada. Reintenta.'); setOcupado(false)
    }
  }
  return (
    <>
      <button type="button" disabled={ocupado} onClick={() => void abrir()} style={estilo}>{ocupado ? 'Abriendo…' : ROTULO_TARIFICAR}</button>
      {error && <span role="alert" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--negative)' }}>{error}</span>}
    </>
  )
}
