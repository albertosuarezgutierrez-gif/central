'use client'
import { useState } from 'react'
import { Contact } from 'lucide-react'
import { btnStyle } from '@/components/ui'

/**
 * «Contactos para el móvil» (23/09/2026): descarga un .vcf con los clientes en
 * vigor y los leads de Vencimientos, con «· AS Cliente» / «· AS Lead» en el
 * nombre para saber quién llama. Se importa en el TELÉFONO, no en la cuenta de
 * Google (Gmail personal: sin contrato de encargado para datos de clientes).
 */
export default function ContactosMovil() {
  const [estado, setEstado] = useState<{ tipo: 'reposo' } | { tipo: 'cargando' } | { tipo: 'ok'; texto: string } | { tipo: 'error'; texto: string }>({ tipo: 'reposo' })

  async function descargar() {
    setEstado({ tipo: 'cargando' })
    try {
      const r = await fetch('/api/correduria/contactos-movil')
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { motivo?: string } | null
        return setEstado({ tipo: 'error', texto: j?.motivo ?? `No se ha podido generar (HTTP ${r.status}).` })
      }
      const blob = await r.blob()
      const nombre = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'contactos.vcf'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre
      a.click()
      URL.revokeObjectURL(url)
      const n = r.headers.get('x-incluidos') ?? '?'
      const sin = Number(r.headers.get('x-sin-canal') ?? 0)
      const sinLeer = Number(r.headers.get('x-clientes-sin-leer') ?? 0)
      setEstado({
        tipo: 'ok',
        texto: `${n} contactos descargados.${sin > 0 ? ` ${sin} sin teléfono ni correo no van.` : ''}${sinLeer > 0 ? ` ⚠️ ${sinLeer} clientes no se pudieron leer y faltan.` : ''}`,
      })
    } catch {
      setEstado({ tipo: 'error', texto: 'No se ha podido descargar. Inténtalo de nuevo.' })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6, margin: '0 0 16px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={descargar} disabled={estado.tipo === 'cargando'} style={{ ...btnStyle('secundario'), minHeight: 44, gap: 8 }}>
          <Contact size={18} strokeWidth={1.75} aria-hidden /> {estado.tipo === 'cargando' ? 'Preparando…' : 'Contactos para el móvil (.vcf)'}
        </button>
        {estado.tipo === 'ok' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{estado.texto}</span>}
        {estado.tipo === 'error' && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{estado.texto}</span>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Clientes en vigor y leads de Vencimientos, con «· AS Cliente» o «· AS Lead» en el nombre. Al importarlo en el móvil elige
        guardar en el <strong>teléfono</strong>, no en la cuenta de Google. Para actualizar, borra antes los contactos «· AS» y vuelve a importar.
      </p>
    </div>
  )
}
