'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { etiquetaRol } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import type { DatosCompania } from '@/lib/datos-compania'

/**
 * «La compañía tiene otro teléfono/correo» (fase 2 del rediseño, 24/09/2026). Los datos de la ficha
 * son los NUESTROS y mandan: CIMA no los cambia. Aquí solo se enseña lo que trae la compañía y no
 * tenemos, con un botón para AÑADIRLO a sus contactos. Nunca sustituye el principal.
 */
export default function DatosCompania({ clienteId, datos }: { clienteId: string; datos: DatosCompania }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  if (datos.estado === 'sin_comprobar') {
    return <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>No se ha podido comparar con lo que tiene la compañía: {datos.motivo}.</p>
  }
  if (datos.nuevos.length === 0 && datos.ilegibles === 0) return null

  async function anadir(tipo: string, valor: string) {
    const clave = `${tipo}:${valor}`
    setOcupado(clave)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/cliente/contactos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, tipo, valor, etiqueta: null, principal: false }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (res.ok && j?.estado === 'ok') {
        setAviso({ ok: true, texto: `Añadido a sus contactos. El principal no se toca.` })
        router.refresh()
      } else if (res.status === 409) {
        setAviso({ ok: false, texto: j?.motivo ?? 'Ese dato ya está en otra ficha: revísalo en Contactos.' })
      } else {
        setAviso({ ok: false, texto: `No se ha añadido: ${j?.motivo ?? `HTTP ${res.status}`}` })
      }
    } catch {
      setAviso({ ok: false, texto: 'No se ha añadido (sin conexión). Reintenta.' })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 13, border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
      <b>{datos.nuevos.length > 0 ? 'La compañía tiene otros datos de este cliente' : 'No se han podido leer los datos que tiene la compañía'}</b>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
        Mandan los nuestros: CIMA no los cambia. Si alguno es bueno, añádelo a sus contactos.
        {datos.incompleta && ' Hay contactos cifrados que no se han podido leer: puede que alguno ya lo tenga.'}
      </span>
      {datos.nuevos.map(d => {
        const clave = `${d.tipo}:${d.valor}`
        return (
          <div key={clave} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ overflowWrap: 'anywhere' }}>
              {d.tipo === 'telefono' ? '📞' : '✉️'} {d.valor}{' '}
              <span style={{ color: 'var(--muted)' }}>· como {etiquetaRol(d.rol).toLowerCase()} en <Link href={`/correduria/poliza/${d.polizaId}`}>su póliza</Link></span>
            </span>
            <button type="button" disabled={ocupado !== null} onClick={() => void anadir(d.tipo, d.valor)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              {ocupado === clave ? 'Añadiendo…' : 'Añadir a sus contactos'}
            </button>
          </div>
        )
      })}
      {datos.ilegibles > 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{datos.ilegibles} dato(s) de la compañía están cifrados y no se han podido leer.</span>}
      {aviso && <div role="status" style={{ color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</div>}
    </div>
  )
}
