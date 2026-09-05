// Botón flotante de WhatsApp.
//
// Es el canal que Alberto quiere para contacto directo (05/09/2026). El número
// NO se escribe aquí: sale de `MEDIADOR`, que es la fuente única del mediador
// en todo el monorepo, y el enlace lo compone `whatsappUrl()` — `wa.me` quiere
// el número sin «+» y sin espacios, y con «+» abre la app con el chat en
// blanco, que es un fallo que no da error.
//
// 📌 Servidor, no cliente: es un `<a>`. Un botón flotante no necesita React.
import { MEDIADOR, whatsappUrl } from '@central/module-seguros'

/** Primer mensaje. Corto a propósito: lo va a mandar alguien desde el móvil. */
const SALUDO = `Hola ${MEDIADOR.marca}, quiero que me miréis un seguro.`

export default function Whatsapp() {
  return (
    <a
      className="wsp"
      href={whatsappUrl(SALUDO)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Escribir por WhatsApp a ${MEDIADOR.marca}`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.56c.12.17 1.75 2.67 4.24 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
      </svg>
    </a>
  )
}
