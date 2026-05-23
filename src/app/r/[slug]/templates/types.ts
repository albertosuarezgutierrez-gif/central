export interface TemplateData {
  nombre: string
  frase_bienvenida?: string
  descripcion_local?: string
  descripcion_barrio?: string
  logo_url?: string
  foto_portada_url?: string
  color_acento: string
  telefono_reservas?: string
  url_google_maps?: string
  url_reserva_directa?: string
  whatsapp?: string
  mostrar_carta: boolean
  mostrar_reservas: boolean
  redes_sociales: Record<string, string>
  carta: { cat: string; items: { nombre: string; descripcion?: string; precio?: number }[] }[]
  horarios: { dia: string; hora: string }[]
  slug: string
  idioma: string
  template?: string
  t: Record<string, string> // traducciones UI
}

export const UI_STRINGS: Record<string, Record<string, string>> = {
  es: {
    carta: 'Nuestra carta',
    reservar: 'Reservar mesa',
    llamar: '📞 Llamar para reservar',
    online: 'Reservar online',
    whatsapp: '💬 WhatsApp',
    horarios: 'Horarios',
    como_llegar: 'Cómo llegar',
    maps: 'Ver en Google Maps',
    footer: 'Web gestionada con',
    reserva_directa: 'Reserva directa, sin comisiones',
  },
  en: {
    carta: 'Our menu',
    reservar: 'Reserve a table',
    llamar: '📞 Call to reserve',
    online: 'Book online',
    whatsapp: '💬 WhatsApp',
    horarios: 'Opening hours',
    como_llegar: 'How to get here',
    maps: 'View on Google Maps',
    footer: 'Powered by',
    reserva_directa: 'Direct booking, no commissions',
  },
  fr: {
    carta: 'Notre carte',
    reservar: 'Réserver une table',
    llamar: '📞 Appeler pour réserver',
    online: 'Réserver en ligne',
    whatsapp: '💬 WhatsApp',
    horarios: 'Horaires',
    como_llegar: 'Comment venir',
    maps: 'Voir sur Google Maps',
    footer: 'Site géré avec',
    reserva_directa: 'Réservation directe, sans commission',
  },
  de: {
    carta: 'Unsere Speisekarte',
    reservar: 'Tisch reservieren',
    llamar: '📞 Anrufen',
    online: 'Online buchen',
    whatsapp: '💬 WhatsApp',
    horarios: 'Öffnungszeiten',
    como_llegar: 'Anfahrt',
    maps: 'Auf Google Maps ansehen',
    footer: 'Website verwaltet mit',
    reserva_directa: 'Direktbuchung, keine Provision',
  },
}
