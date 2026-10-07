'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { rutaVariante } from '../../oportunidad/[id]/variante'
import type { DestinoTarificar } from '@/lib/correduria/tarificar-oportunidad'

/**
 * «Tarificar» en la tarjeta de Oportunidades (07/10/2026). SOLO abre la pantalla de precio del ramo
 * (`…-nuevo?oportunidad=`), donde se confirma y se paga: este botón nunca cotiza. Si la póliza no tiene
 * seguimiento, antes lo abre (gratis, el mismo de «Abrir riesgo»). Ramo sin tarifa: deshabilitado con motivo.
 */
export default function TarificarOportunidad({ destino, tomadorId }: { destino: DestinoTarificar; tomadorId: string }) {
  const router = useRouter()
  const idMotivo = useId()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const estilo = { ...btnStyle('primario', 'sm'), minHeight: 44 }

  if (destino.tipo === 'enlace') {
    return <Link href={destino.href} prefetch={false} style={{ ...estilo, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Tarificar</Link>
  }
  if (destino.tipo === 'no') {
    return (
      <span style={{ display: 'grid', gap: 2, flexBasis: '100%' }}>
        <button type="button" disabled aria-describedby={idMotivo} style={estilo}>Tarificar</button>
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
      if (!r.ok || json?.estado !== 'ok' || !json.oportunidadId) { setError(`No se ha podido abrir su seguimiento: ${json?.motivo ?? `HTTP ${r.status}`}`); return }
      router.push(rutaVariante(destino.ramo, tomadorId, json.oportunidadId))
    } catch {
      setError('Sin conexión: no se ha abierto nada. Reintenta.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <>
      <button type="button" disabled={ocupado} onClick={() => void abrir()} style={estilo}>{ocupado ? 'Abriendo…' : 'Tarificar'}</button>
      {error && <span role="alert" style={{ flexBasis: '100%', fontSize: 12, color: 'var(--negative)' }}>{error}</span>}
    </>
  )
}
