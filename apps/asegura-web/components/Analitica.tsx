'use client'
// Puente entre el consentimiento (Cookiebot) y la medición (PostHog).
//
// La regla que gobierna este archivo está en `lib/analitica.ts` y es una
// función pura y testeada, `puedeMedir()`. Aquí no se decide nada: aquí se
// obedece. Si alguna vez hay que cambiar cuándo se mide, se cambia allí y el
// cepo de `lib/analitica.test.ts` lo valida — no se añade una condición suelta
// en un `useEffect`, que es donde estas cosas se pudren sin que nada falle.
//
// 🚨 PostHog NO viaja en el bundle. El script se descarga de su CDN **solo**
// cuando el visitante ya ha aceptado. Un `import posthog from 'posthog-js'`
// habría metido ~50 KB en cada carga de una web de captación y, sobre todo,
// habría dejado la librería lista para arrancar por accidente: lo que no está
// descargado no se puede disparar por un `if` mal escrito.
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { COOKIEBOT_ID, POSTHOG_HOST, POSTHOG_KEY, puedeMedir, scriptPostHog, type Consentimiento } from '@/lib/analitica'

type PostHogMin = {
  init: (key: string, opciones: Record<string, unknown>) => void
  capture: (evento: string, props?: Record<string, unknown>) => void
  opt_out_capturing: () => void
  reset: (borrarId?: boolean) => void
}

declare global {
  interface Window {
    Cookiebot?: { consent?: Consentimiento; renew?: () => void }
    posthog?: PostHogMin
  }
}

const CONFIG = { cookiebotId: COOKIEBOT_ID, posthogKey: POSTHOG_KEY }

/** Eventos con los que Cookiebot avisa de que el consentimiento cambió. */
const EVENTOS = ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline'] as const

export default function Analitica() {
  const pathname = usePathname()
  // `arrancado` distingue «nunca se inició» de «se inició y ahora lo retiran»:
  // en el segundo caso hay que apagarlo explícitamente, no basta con no medir.
  const arrancado = useRef(false)
  const cargando = useRef(false)

  useEffect(() => {
    // Sin gestor de consentimiento o sin clave no hay nada que hacer, y esta es
    // la puerta que en la otra web estaba abierta.
    if (!CONFIG.cookiebotId || !CONFIG.posthogKey) return

    function arrancar() {
      if (arrancado.current || cargando.current) return
      cargando.current = true
      const s = document.createElement('script')
      s.src = scriptPostHog(POSTHOG_HOST)
      s.async = true
      s.onload = () => {
        cargando.current = false
        if (!window.posthog || !puedeMedir(window.Cookiebot?.consent, CONFIG)) return
        window.posthog.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          // Los pageviews los manda esta misma componente al cambiar de ruta:
          // con el App Router, la navegación no recarga la página y el captador
          // automático se pierde las visitas a partir de la segunda.
          capture_pageview: false,
          capture_pageleave: true,
          // Una web pública se visita de forma anónima. Sin esto, PostHog crea
          // un perfil de persona por cada visitante y acabaríamos guardando
          // datos personales de gente que solo miró la página de hogar.
          person_profiles: 'identified_only',
          // 🚨 Nunca: el formulario de leads pide nombre, teléfono y correo, y
          // una grabación de sesión los captura tecleados aunque el campo se
          // enmascare mal. No compensa para lo que esta web necesita medir.
          disable_session_recording: true,
        })
        arrancado.current = true
        window.posthog.capture('$pageview')
      }
      s.onerror = () => {
        cargando.current = false
      }
      document.head.appendChild(s)
    }

    function apagar() {
      if (!arrancado.current || !window.posthog) return
      window.posthog.opt_out_capturing()
      // `true` borra también el id del dispositivo: retirar el consentimiento
      // tiene que dejar de identificar, no solo dejar de enviar.
      window.posthog.reset(true)
      arrancado.current = false
    }

    function revisar() {
      if (puedeMedir(window.Cookiebot?.consent, CONFIG)) arrancar()
      else apagar()
    }

    // El evento `CookiebotOnConsentReady` puede haber saltado antes de que React
    // hidratara, así que además de suscribirse hay que mirar el estado actual.
    revisar()
    for (const e of EVENTOS) window.addEventListener(e, revisar)
    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, revisar)
    }
  }, [])

  // Pageview por navegación. `$current_url` lo lee PostHog de `location.href`,
  // así que los UTM de la query entran solos sin tener que leer searchParams
  // (que en el App Router obligaría a envolver esto en un Suspense).
  useEffect(() => {
    if (!arrancado.current || !window.posthog) return
    window.posthog.capture('$pageview')
  }, [pathname])

  return null
}

/**
 * Reabre el diálogo de Cookiebot. Lo usa la página de cookies para que el
 * visitante pueda cambiar de opinión: sin una forma visible de retirar el
 * consentimiento, pedirlo no vale (art. 7.3 RGPD).
 */
export function renovarConsentimiento() {
  window.Cookiebot?.renew?.()
}
