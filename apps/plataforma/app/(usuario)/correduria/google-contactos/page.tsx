import Link from 'next/link'
import { BookUser } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import GoogleContactosVista from './GoogleContactosVista'

/**
 * Google Contactos (05/10/2026): la agenda del móvil/WhatsApp sincronizada con la cartera.
 * Página propia, como «Compañías» y «Mantenimiento», con entrada en el menú «…» de la cabecera de
 * `/correduria`. Aquí aterriza también la vuelta del OAuth de Google (`?google=ok|error&motivo=…`).
 * La puerta la cierra `../layout.tsx`; los datos los pide cada bloque a `/api/correduria/google-contactos-*`
 * (con `exigirCorreduria`).
 */
export default function GoogleContactosPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
          <PageHeader
            titulo="Google Contactos"
            icono={<BookUser size={20} strokeWidth={1.75} />}
            sub="La cartera en vigor y los leads en la agenda de tu móvil (etiqueta «Grupo ASegura»). El CRM manda; lo que se cambie en Google va a la cola de revisión."
          />
        </div>
        <GoogleContactosVista />
      </div>
    </Pagina>
  )
}
