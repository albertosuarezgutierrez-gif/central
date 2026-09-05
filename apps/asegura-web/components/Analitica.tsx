'use client'

// Medición de visitas, con el consentimiento como interruptor.
//
// El orden importa y es este, sin atajos:
//
//   1. El layout carga Cookiebot en el `<head>` (script normal, no `next/script`:
//      tiene que estar ANTES que cualquier otra cosa, y es lo único que pinta el
//      banner).
//   2. Este componente NO carga PostHog al montarse. Se queda escuchando.
//   3. Solo cuando Cookiebot dice que hay consentimiento de **estadística** se
//      importa `posthog-js` —importación dinámica, así que ni siquiera está en
//      el bundle inicial de quien no acepta— y se inicializa.
//   4. Si el visitante retira el consentimiento, se deja de medir en el acto.
//
// 🚨 Qué se mide y qué NO, y por qué:
//
// - `autocapture: false`. Por defecto PostHog registra cada clic con el texto
//   del elemento pulsado. Esta web tiene un formulario donde la gente escribe
//   su nombre y su teléfono para pedir un seguro —y en vida o salud, tienden a
//   contar de más—. Un autocapture sobre eso acaba metiendo datos personales,
//   y a veces del art. 9, en una herramienta de analítica. No compensa: lo que
//   hace falta para decidir dónde invertir es qué páginas se ven y cuántos
//   formularios salen, no dónde pincha cada uno.
// - `disable_session_recording: true`. Grabar la sesión de alguien rellenando
//   sus datos es exactamente el mismo problema, en vídeo.
// - `person_profiles: 'never'`. Nadie inicia sesión aquí: no hay a quién
//   identificar. Sin perfiles de persona se siguen contando visitantes únicos
//   y no se construye una ficha de nadie.
//
// (En el CRM del otro repo pasaba justo lo contrario: mandaba el identificador
// del usuario que iniciaba sesión sin mirar el consentimiento. Por eso aquí la
// captura de eventos vive solo en el navegador y detrás del banner.)
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { CONFIG_ANALITICA } from '@/lib/analitica'

/** Lo que Cookiebot deja en `window`. Solo se declara lo que se usa. */
type VentanaConCookiebot = Window & {
  Cookiebot?: { consent?: { statistics?: boolean } }
}

function hayConsentimientoEstadistico(): boolean {
  if (typeof window === 'undefined') return false
  // Sin objeto `Cookiebot` (script bloqueado, sin red, dominio no dado de alta)
  // la respuesta es NO. Es la lectura conservadora: ante la duda no se mide.
  return (window as VentanaConCookiebot).Cookiebot?.consent?.statistics === true
}

export function Analitica() {
  const ruta = usePathname()
  /** ¿Se llegó a llamar a `init`? Se lleva aquí y no leyendo internos de PostHog. */
  const iniciado = useRef(false)
  /**
   * Última URL ya contada.
   *
   * Es lo que impide contar dos veces la página de entrada: la primera vista la
   * manda quien llegue antes —el efecto del consentimiento o el de la ruta—, y
   * el otro se encuentra la URL ya apuntada y no hace nada. Sin esto, aceptar
   * el banner en la home la contaría dos veces y el embudo empezaría torcido.
   */
  const ultimaUrl = useRef<string | null>(null)

  async function medirVista() {
    if (!CONFIG_ANALITICA) return
    if (!hayConsentimientoEstadistico()) return
    const url = window.location.href
    if (ultimaUrl.current === url) return

    const { default: posthog } = await import('posthog-js')
    if (!iniciado.current) {
      posthog.init(CONFIG_ANALITICA.clave, {
        api_host: CONFIG_ANALITICA.host,
        autocapture: false,
        disable_session_recording: true,
        person_profiles: 'never',
        // La vista de página la manda este componente, que es el que sabe de
        // las navegaciones internas de Next. Dejarlo en `true` contaría dos
        // veces la primera página.
        capture_pageview: false,
      })
      iniciado.current = true
    }
    posthog.opt_in_capturing()
    ultimaUrl.current = url
    posthog.capture('$pageview', { $current_url: url })
  }

  // Arranque y parada según el consentimiento.
  useEffect(() => {
    if (!CONFIG_ANALITICA) return

    const alAceptar = () => void medirVista()
    const alRechazar = () => {
      void import('posthog-js').then(({ default: posthog }) => {
        if (iniciado.current) posthog.opt_out_capturing()
      })
    }

    // Si el visitante ya había aceptado en una visita anterior, Cookiebot no
    // enseña el banner: el evento que llega es `CookiebotOnConsentReady`.
    window.addEventListener('CookiebotOnConsentReady', alAceptar)
    window.addEventListener('CookiebotOnAccept', alAceptar)
    window.addEventListener('CookiebotOnDecline', alRechazar)
    // Y si Cookiebot ya había terminado antes de que React montara esto, no va
    // a volver a disparar ningún evento: se comprueba a mano una vez.
    void medirVista()

    return () => {
      window.removeEventListener('CookiebotOnConsentReady', alAceptar)
      window.removeEventListener('CookiebotOnAccept', alAceptar)
      window.removeEventListener('CookiebotOnDecline', alRechazar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Vista de página en cada navegación interna. Next no recarga el documento al
  // ir de /seguros/hogar a /seguros/auto, así que sin esto toda la web
  // aparecería como una sola visita a la página de entrada.
  //
  // Se lee `window.location.href` en vez de `useSearchParams()` a propósito:
  // ese hook obliga a envolver el árbol en un `<Suspense>` y a renderizar la
  // página entera en cliente, y aquí solo hacen falta los parámetros (las UTM
  // de una campaña), que ya están en la URL.
  useEffect(() => {
    void medirVista()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta])

  return null
}
