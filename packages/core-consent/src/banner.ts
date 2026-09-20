// Construye la config de vanilla-cookieconsent (https://cookieconsent.orestbida.com) a
// partir de nuestros textos. Función pura: no llama a CookieConsent.run() aquí, eso lo hace
// quien consuma el paquete (ver ConsentBanner.tsx de cada app, o el snippet vanilla de
// housesevillana) — así esta pieza se puede testear sin navegador.
import { TEXTOS_BANNER, type TextosIdioma } from './textos.ts'

type Idioma = 'es' | 'en' | 'it'

function traduccion(t: TextosIdioma) {
  return {
    consentModal: {
      title: t.titulo,
      description: t.descripcion,
      acceptAllBtn: t.aceptarTodo,
      acceptNecessaryBtn: t.rechazarTodo,
      showPreferencesBtn: t.gestionarPreferencias,
    },
    preferencesModal: {
      title: t.gestionarPreferencias,
      acceptAllBtn: t.aceptarTodo,
      acceptNecessaryBtn: t.rechazarTodo,
      savePreferencesBtn: t.guardarPreferencias,
      sections: [
        { title: t.categoriaNecesaria, description: t.categoriaNecesariaDescripcion, linkedCategory: 'necessary' },
        { title: t.categoriaStatistics, description: t.categoriaStatisticsDescripcion, linkedCategory: 'statistics' },
        { title: t.categoriaMarketing, description: t.categoriaMarketingDescripcion, linkedCategory: 'marketing' },
      ],
    },
  }
}

export function configBanner(idioma: Idioma) {
  return {
    categories: {
      necessary: { enabled: true, readOnly: true },
      statistics: {},
      marketing: {},
    },
    language: {
      default: idioma,
      translations: {
        es: traduccion(TEXTOS_BANNER.es),
        en: traduccion(TEXTOS_BANNER.en),
        it: traduccion(TEXTOS_BANNER.it),
      },
    },
  }
}
