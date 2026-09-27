'use client'
import { Mail } from 'lucide-react'
import BotonWhatsapp from './BotonWhatsapp'

/**
 * Botones de WhatsApp y correo para UN contacto de compañía, compartidos
 * entre `Companias.tsx` (tabla, pestaña Datos) y `/correduria/companias`
 * (tarjetas). Al pulsar cualquiera, marca `ultimo_contacto_en` — best-effort,
 * fire-and-forget: si el PATCH falla, el WhatsApp/mail ya se ha abierto igual
 * (la propia navegación del `<a>` no espera a este fetch).
 */
export default function ContactoAcciones({
  contactoId, nombre, telefono, email, compacto = false,
}: {
  contactoId: string
  nombre: string
  telefono: string | null
  email: string | null
  compacto?: boolean
}) {
  function marcarContactado() {
    fetch('/api/correduria/companias/contactado', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contactoId }),
    }).catch(() => {})
  }

  if (!telefono && !email) return null
  const lado = compacto ? 32 : 44

  return (
    <div style={{ display: 'flex', gap: compacto ? 4 : 6 }}>
      {telefono && (
        <span onClick={marcarContactado}>
          <BotonWhatsapp telefono={telefono} compacto={compacto} />
        </span>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          onClick={marcarContactado}
          aria-label={`Escribir a ${nombre}`}
          title={`Escribir a ${nombre}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: lado, height: lado, borderRadius: 8,
            border: '1px solid var(--border)', color: 'var(--text)',
          }}
        >
          <Mail size={compacto ? 15 : 18} strokeWidth={1.75} aria-hidden />
        </a>
      )}
    </div>
  )
}
