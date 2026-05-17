// lib/useIdiomasCarta.ts
// Hook/utilidades compartidas para multiidioma de carta (QR + PDF)

export const IDIOMAS_CARTA = [
  { code: 'es', label: 'Español',   flag: '🇪🇸' },
  { code: 'en', label: 'English',   flag: '🇬🇧' },
  { code: 'fr', label: 'Français',  flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',   flag: '🇩🇪' },
  { code: 'it', label: 'Italiano',  flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
] as const

export type CodigoIdioma = typeof IDIOMAS_CARTA[number]['code']

export const IDIOMAS_VALIDOS = IDIOMAS_CARTA.map(i => i.code)

/** Detecta el idioma del navegador y devuelve el código más cercano soportado */
export function detectarIdioma(): CodigoIdioma {
  if (typeof navigator === 'undefined') return 'es'
  const lang = navigator.language.slice(0, 2).toLowerCase() as CodigoIdioma
  return IDIOMAS_VALIDOS.includes(lang) ? lang : 'es'
}

/** Persiste la elección en localStorage con clave por restaurante */
export function guardarIdioma(code: CodigoIdioma, slug?: string) {
  try {
    const key = slug ? `iarest_lang_${slug}` : 'iarest_lang'
    localStorage.setItem(key, code)
  } catch {}
}

export function leerIdioma(slug?: string): CodigoIdioma {
  try {
    const key = slug ? `iarest_lang_${slug}` : 'iarest_lang'
    const stored = localStorage.getItem(key) as CodigoIdioma | null
    if (stored && IDIOMAS_VALIDOS.includes(stored)) return stored
  } catch {}
  return detectarIdioma()
}
