'use client'
import { useEffect, useState } from 'react'

/**
 * «📲 Instalar app» en el pie del menú (25/09/2026, Alberto: «una web app de mi intranet para
 * acceder a través de la aplicación y no del navegador»).
 *
 * La intranet ya es instalable (manifest + SW, PR #3530); esto solo evita depender del menú del
 * navegador. Tres caminos:
 * - Chrome/Edge/Android: el navegador ofrece `beforeinstallprompt` y el botón lanza su diálogo.
 * - iPhone/iPad: Apple no deja instalar con un botón → se enseñan los pasos de Safari.
 * - Ya instalada (`display-mode: standalone`) o navegador sin soporte: no se pinta nada.
 */

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function esIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS se presenta como Mac: se distingue por tener pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

function yaInstalada(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null)
  const [ios, setIos] = useState(false)
  const [verPasos, setVerPasos] = useState(false)
  const [instalada, setInstalada] = useState(true)

  useEffect(() => {
    if (yaInstalada()) return
    setInstalada(false)
    setIos(esIos())
    const alOfrecer = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalar) }
    const alInstalar = () => { setInstalada(true); setEvento(null) }
    window.addEventListener('beforeinstallprompt', alOfrecer)
    window.addEventListener('appinstalled', alInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', alOfrecer)
      window.removeEventListener('appinstalled', alInstalar)
    }
  }, [])

  if (instalada || (!evento && !ios)) return null

  async function instalar() {
    if (evento) {
      await evento.prompt()
      await evento.userChoice.catch(() => null)
      setEvento(null)
    } else {
      setVerPasos(v => !v)
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={instalar}
        style={{
          width: '100%', minHeight: 44, padding: '8px', fontSize: 13, fontWeight: 600,
          border: '1px solid var(--primary)', borderRadius: 999,
          color: 'var(--primary)', background: 'transparent', cursor: 'pointer',
        }}
      >📲 Instalar app</button>
      {verPasos && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 2px 0', lineHeight: 1.45 }}>
          En iPhone, desde <b>Safari</b>: botón Compartir (cuadrado con flecha) → <b>«Añadir a pantalla de inicio»</b>.
        </p>
      )}
    </div>
  )
}
