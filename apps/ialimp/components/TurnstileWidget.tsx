'use client'
import { useEffect, useRef } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

// Widget de Cloudflare Turnstile (CAPTCHA gratuito).
// Si no hay site key configurada, no renderiza nada y entrega un token vacío
// (el backend, sin secret, tampoco exige captcha) → la app funciona igual.
export default function TurnstileWidget({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    if (!SITE_KEY) { cb.current('') ; return }
    let timer: any

    function render() {
      const ts = (window as any).turnstile
      if (!ts || !ref.current || widgetId.current) return
      widgetId.current = ts.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => cb.current(token),
        'error-callback': () => cb.current(''),
        'expired-callback': () => cb.current(''),
      })
    }

    if ((window as any).turnstile) {
      render()
    } else {
      const id = 'cf-turnstile-script'
      if (!document.getElementById(id)) {
        const s = document.createElement('script')
        s.id = id
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        s.async = true
        s.defer = true
        s.onload = render
        document.head.appendChild(s)
      } else {
        timer = setInterval(() => {
          if ((window as any).turnstile) { clearInterval(timer); render() }
        }, 100)
      }
    }
    return () => { if (timer) clearInterval(timer) }
  }, [])

  if (!SITE_KEY) return null
  return <div ref={ref} style={{ margin: '2px 0 14px' }} />
}
