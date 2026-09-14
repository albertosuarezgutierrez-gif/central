// Textos legales del banner. Los tres idiomas se escriben desde el principio porque
// housesevillana los necesita los tres — sus /en y /it se derivan de la misma plantilla por
// diccionario de cadenas exactas (ver apps/housesevillana/CLAUDE.md), y un banner solo en
// español ahí rompería la coherencia de idioma de la página. asegura-web e ia-rest solo usan `es`.

export type TextosIdioma = {
  titulo: string
  descripcion: string
  aceptarTodo: string
  rechazarTodo: string
  gestionarPreferencias: string
  guardarPreferencias: string
  categoriaNecesaria: string
  categoriaNecesariaDescripcion: string
  categoriaStatistics: string
  categoriaStatisticsDescripcion: string
  categoriaMarketing: string
  categoriaMarketingDescripcion: string
}

export const TEXTOS_BANNER: Record<'es' | 'en' | 'it', TextosIdioma> = {
  es: {
    titulo: 'Usamos cookies',
    descripcion: 'Usamos cookies para medir las visitas y, si lo aceptas, para mostrarte anuncios relevantes. Puedes cambiar de opinión cuando quieras.',
    aceptarTodo: 'Aceptar todo',
    rechazarTodo: 'Rechazar todo',
    gestionarPreferencias: 'Gestionar preferencias',
    guardarPreferencias: 'Guardar preferencias',
    categoriaNecesaria: 'Necesarias',
    categoriaNecesariaDescripcion: 'Imprescindibles para que la web funcione. No se pueden desactivar.',
    categoriaStatistics: 'Estadística',
    categoriaStatisticsDescripcion: 'Nos ayudan a saber qué páginas se visitan más.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Se usan para mostrarte anuncios relevantes en otras webs.',
  },
  en: {
    titulo: 'We use cookies',
    descripcion: 'We use cookies to measure visits and, if you accept, to show you relevant ads. You can change your mind at any time.',
    aceptarTodo: 'Accept all',
    rechazarTodo: 'Reject all',
    gestionarPreferencias: 'Manage preferences',
    guardarPreferencias: 'Save preferences',
    categoriaNecesaria: 'Necessary',
    categoriaNecesariaDescripcion: 'Essential for the website to work. They cannot be disabled.',
    categoriaStatistics: 'Statistics',
    categoriaStatisticsDescripcion: 'Help us understand which pages are visited the most.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Used to show you relevant ads on other websites.',
  },
  it: {
    titulo: 'Utilizziamo i cookie',
    descripcion: 'Utilizziamo i cookie per misurare le visite e, se accetti, per mostrarti annunci pertinenti. Puoi cambiare idea in qualsiasi momento.',
    aceptarTodo: 'Accetta tutto',
    rechazarTodo: 'Rifiuta tutto',
    gestionarPreferencias: 'Gestisci preferenze',
    guardarPreferencias: 'Salva preferenze',
    categoriaNecesaria: 'Necessari',
    categoriaNecesariaDescripcion: 'Essenziali per il funzionamento del sito. Non possono essere disattivati.',
    categoriaStatistics: 'Statistiche',
    categoriaStatisticsDescripcion: 'Ci aiutano a capire quali pagine vengono visitate di più.',
    categoriaMarketing: 'Marketing',
    categoriaMarketingDescripcion: 'Usati per mostrarti annunci pertinenti su altri siti web.',
  },
}
