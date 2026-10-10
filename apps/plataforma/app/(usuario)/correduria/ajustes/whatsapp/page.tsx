import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import WhatsappConexion from './WhatsappConexion'

/**
 * WhatsApp Business de la correduría (05/10/2026): conectar el número de la app del móvil al CRM por
 * Embedded Signup de Meta (Coexistence; Alberto es Tech Provider, sin BSP). Entrada en el menú «…» de la
 * cabecera de `/correduria`. La puerta la cierra `../../layout.tsx`; el dato llega por
 * `/api/correduria/whatsapp-conexion` (con `exigirCorreduria`) desde el puerto de asegura.
 * Doc: apps/asegura/docs/WHATSAPP.md. Aquí no se envía ningún mensaje.
 */
export default function WhatsappAjustesPage() {
  return (
    <Pagina ancho="lectura">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="WhatsApp Business"
            icono={<MessageCircle size={20} strokeWidth={1.75} />}
            sub="Tu número de WhatsApp Business conectado al CRM: lo que te escriben (y lo que contestas desde el móvil) entra en la ficha del cliente. El móvil sigue funcionando igual."
          />
        </div>
        <WhatsappConexion />
      </div>
    </Pagina>
  )
}
