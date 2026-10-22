'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import { rutaTarificar, type DestinoTarificar } from '@/lib/correduria/tarificar-oportunidad'

/**
 * «Tarificar →» en la tarjeta de Oportunidades (07/10/2026). SOLO abre la pantalla de precio (Avant2: `rutaPedirPrecio`;
 * bots: el bloque «Presupuestos de compañías» de la oportunidad), donde se confirma: este botón nunca cotiza. Si la
 * póliza no tiene seguimiento, antes lo abre (gratis). 22/10/2026: si la oportunidad NO se tarifica de verdad
 * (`comoSeTarifica` → `no`), el botón NO se pinta (antes salía deshabilitado); el acceso a la oportunidad lo da su
 * «Ver riesgo →», donde se declara el desenlace a mano.
 */
export const ROTULO_TARIFICAR = 'Tarificar →'

export default function TarificarOportunidad({ destino, tomadorId }: { destino: DestinoTarificar; tomadorId: string }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estilo = { ...btnStyle('primario', 'sm'), minHeight: 44 }

  if (destino.tipo === 'no') return null
  if (destino.tipo === 'enlace') {
    return <Link href={destino.href} prefetch={false} style={{ ...estilo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{ROTULO_TARIFICAR}</Link>
  }
  async function abrir() {
    if (destino.tipo !== 'abrir-y-enlazar' || ocupado) return
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad/de-poliza', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ polizaId: destino.polizaId }) })
      const json = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; oportunidadId?: string } | null
      if (!r.ok || json?.estado !== 'ok' || !json.oportunidadId) { setError(`No se ha podido abrir su seguimiento: ${json?.motivo ?? `HTTP ${r.status}`}`); setOcupado(false); return }
      router.push(rutaTarificar(destino.como, tomadorId, json.oportunidadId) ?? `/correduria/oportunidad/${encodeURIComponent(json.oportunidadId)}`)
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
