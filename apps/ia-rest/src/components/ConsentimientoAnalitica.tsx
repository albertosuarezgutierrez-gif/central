'use client'
// Puente entre el consentimiento (nuestro propio banner, vanilla-cookieconsent
// vía @central/core-consent) y la medición (Google Analytics 4).
//
// Mismo patrón que `apps/asegura-web/components/Analitica.tsx` (Task Group B del
// plan de consentimiento unificado): aquí no se decide nada, se obedece a
// `puedeCargar()` del paquete compartido.
//
// 🚨 GA4 ya NO se carga sin condición desde `layout.tsx` (antes: dos <script>
// sueltos en <head>, sirviéndose siempre, incluso antes de que el visitante
// hubiera visto el banner). La única forma de que esta web mida sin
// consentimiento sería no montar <ConsentimientoAnalitica /> — y eso lo vigila
// el guardián de fuente `test/regression-ga4-fail-closed.test.ts`, no una env.
//
// GA4 no tiene parada limpia por script suelto (a diferencia de PostHog en
// asegura-web): retirar el consentimiento deja de cargarlo en la SIGUIENTE
// visita, no en caliente. Por eso `cargarGa4()` no tiene contrapartida
// `apagarGa4()` — es correcto que no la haya, no un olvido.
import { useEffect } from 'react'
import * as CookieConsent from 'vanilla-cookieconsent'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import { puedeCargar, configBanner, cargarGa4 } from '@central/core-consent'

const GA4_ID = 'G-EN2YQLRLEX'
const CONFIG = { categoria: 'statistics' as const, credencial: GA4_ID }
let arrancado = false

export default function ConsentimientoAnalitica() {
  useEffect(() => {
    function revisar() {
      const acepta = CookieConsent.acceptedCategory('statistics')
      if (puedeCargar({ statistics: acepta }, CONFIG) && !arrancado) {
        cargarGa4(GA4_ID)
        arrancado = true
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

  return null
}
