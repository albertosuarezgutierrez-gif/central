'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Phone, Pencil } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import ContactoAcciones from '../ContactoAcciones'

/**
 * Teléfono de un contacto de compañía en `/correduria/companias` (05/10/2026, Alberto: «solo sale
 * el email»). Botón `tel:` de 44 px, WhatsApp/correo de `ContactoAcciones` (WhatsApp solo si el
 * número es un MÓVIL: `urlWhatsapp`), y «Añadir/Cambiar teléfono» para meterlo a mano; asegura lo
 * valida y lo guarda en E.164 (de aquí salen los contactos 🔵 de Google Contacts).
 */
export default function TelefonoContacto({ contactoId, nombre, telefono, email }: {
  contactoId: string
  nombre: string
  telefono: string | null
  email: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(telefono ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(nuevo: string | null) {
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/companias/telefono', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactoId, telefono: nuevo }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string } | null
      if (r.ok && j?.estado === 'ok') {
        setEditando(false)
        router.refresh()
        return
      }
      setError(j?.estado === 'invalido' ? 'Eso no es un teléfono válido (prueba con +34 600 11 22 33).' : `No se ha podido guardar (HTTP ${r.status}).`)
    } catch {
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {telefono && (
          <a href={`tel:${telefono.replace(/[^0-9+]/g, '')}`} aria-label={`Llamar a ${nombre}`}
            style={{ ...btnStyle('secundario'), minHeight: 44, textDecoration: 'none' }}>
            <Phone size={15} strokeWidth={1.75} aria-hidden /> {telefono}
          </a>
        )}
        <ContactoAcciones contactoId={contactoId} nombre={nombre} telefono={telefono} email={email} />
        {!editando && (
          <button type="button" onClick={() => { setValor(telefono ?? ''); setEditando(true) }} style={{ ...btnStyle('sutil'), minHeight: 44 }}>
            <Pencil size={14} strokeWidth={1.75} aria-hidden /> {telefono ? 'Cambiar teléfono' : 'Añadir teléfono'}
          </button>
        )}
      </div>
      {editando && (
        <form onSubmit={(e) => { e.preventDefault(); void guardar(valor) }} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <input type="tel" inputMode="tel" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)}
            aria-label={`Teléfono de ${nombre}`} placeholder="+34 600 11 22 33" maxLength={40}
            style={{ flex: '1 1 10rem', minWidth: 0, minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }} />
          <button type="submit" disabled={guardando} style={{ ...btnStyle('primario'), minHeight: 44 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {telefono && (
            <button type="button" disabled={guardando} onClick={() => { if (window.confirm(`¿Quitar el teléfono de ${nombre}?`)) void guardar(null) }} style={{ ...btnStyle('secundario'), minHeight: 44 }}>Quitar</button>
          )}
          <button type="button" disabled={guardando} onClick={() => { setEditando(false); setError(null) }} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Cancelar</button>
        </form>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--negative)' }}>{error}</p>}
    </div>
  )
}
