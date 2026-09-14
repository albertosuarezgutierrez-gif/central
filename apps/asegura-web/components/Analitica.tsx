'use client'
// Puente entre el consentimiento (nuestro propio banner, vanilla-cookieconsent
// vía @central/core-consent) y la medición (PostHog).
//
// La regla que gobierna este archivo está en `lib/analitica.ts` — que ahora
// reexporta `puedeCargar()` de `@central/core-consent` — y es una función pura
// y testeada. Aquí no se decide nada: aquí se obedece. Si alguna vez hay que
// cambiar cuándo se mide, se cambia allí (o en el paquete) y el cepo de
// `lib/analitica.test.ts` lo valida — no se añade una condición suelta en un
// `useEffect`, que es donde estas cosas se pudren sin que nada falle.
//
// 🚨 PostHog NO viaja en el bundle. El script se descarga de su CDN **solo**
// cuando el visitante ya ha aceptado (lo hace `arrancarPostHog()` del
// paquete). Un `import posthog from 'posthog-js'` habría metido ~50 KB en cada
// carga de una web de captación y, sobre todo, habría dejado la librería lista
// para arrancar por accidente: lo que no está descargado no se puede disparar
// por un `if` mal escrito.
//
// 🔁 Ya NO depende de Cookiebot ni de su credencial: el CMP es nuestro
// (`CookieConsent.run()`), así que la única forma de que esta web no pida
// consentimiento sería no montar <Analitica /> — y eso lo vigila el guardián
// de fuente `test/regression-analitica-fail-closed.test.ts`, no una env.
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import {
  puedeCargar,
  configBanner,
  arrancarPostHog,
  apagarPostHog,
  POSTHOG_KEY,
  POSTHOG_HOST,
} from '@/lib/analitica'

const CONFIG = { categoria: 'statistics' as const, credencial: POSTHOG_KEY }

export default function Analitica() {
  const pathname = usePathname()
  // Distingue «nunca se inició» de «se inició y ahora lo retiran»: en el
  // segundo caso hay que apagarlo explícitamente, no basta con no medir.
  const arrancado = useRef(false)

  useEffect(() => {
    // Sin clave de PostHog no hay nada que arrancar — y sin banner tampoco hay
    // forma de pedir permiso, así que ni se monta el CMP.
    if (!POSTHOG_KEY) return

    function revisar() {
      const acepta = CookieConsent.acceptedCategory('statistics')
      if (puedeCargar({ statistics: acepta }, CONFIG) && !arrancado.current) {
        arrancarPostHog(POSTHOG_KEY, POSTHOG_HOST, () => {
          arrancado.current = true
        })
      } else if (!acepta && arrancado.current) {
        apagarPostHog()
        arrancado.current = false
      }

      // Registro de auditoría, fire-and-forget: un fallo de red aquí nunca
      // bloquea la navegación ni el banner, por eso el `.catch(() => {})` sin
      // más. Sin PII: solo qué categorías se aceptaron.
      fetch('/api/consentimiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorias: CookieConsent.getUserPreferences().acceptedCategories }),
      }).catch(() => {})
    }

    CookieConsent.run({
      ...configBanner('es'),
      onFirstConsent: revisar,
      onConsent: revisar,
      onChange: revisar,
    })
  }, [])

  useEffect(() => {
    if (!arrancado.current || !window.posthog) return
    window.posthog.capture('$pageview')
  }, [pathname])

  return null
}

/**
 * Reabre el diálogo de preferencias. Lo usa la página de cookies para que el
 * visitante pueda cambiar de opinión: sin una forma visible de retirar el
 * consentimiento, pedirlo no vale (art. 7.3 RGPD).
 */
export function renovarConsentimiento() {
  CookieConsent.showPreferences()
}
