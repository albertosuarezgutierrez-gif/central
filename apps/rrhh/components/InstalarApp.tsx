'use client'
import { useEffect, useState } from 'react'

/**
 * Botón discreto «Instalar la app» (solo entorno Grupo ASegura). Copiado del patrón de apps/asegura-portal.
 *  · Android/Chrome/Edge: `beforeinstallprompt` (se intercepta y se lanza al pulsar; vale una vez).
 *  · iPhone/iPad: Safari no lo implementa → instrucción «Compartir → Añadir a pantalla de inicio».
 *  · Ya instalada o navegador que no la ofrece: no se pinta nada.
 */
interface EventoInstalacion extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type Estado = 'indeterminado' | 'instalable' | 'ios' | 'no'

export default function InstalarApp() {
  const [estado, setEstado] = useState<Estado>('indeterminado')
  const [evento, setEvento] = useState<EventoInstalacion | null>(null)
  const [verIos, setVerIos] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    if (instalada) { setEstado('no'); return }
    if (ios) { setEstado('ios'); return }
    setEstado('no')
    const antes = (e: Event) => { e.preventDefault(); setEvento(e as EventoInstalacion); setEstado('instalable') }
    const despues = () => { setEvento(null); setEstado('no') }
    window.addEventListener('beforeinstallprompt', antes)
    window.addEventListener('appinstalled', despues)
    return () => { window.removeEventListener('beforeinstallprompt', antes); window.removeEventListener('appinstalled', despues) }
  }, [])

  if (estado !== 'instalable' && estado !== 'ios') return null

  async function pulsar() {
    if (estado === 'ios') { setVerIos(v => !v); return }
    const e = evento
    if (!e) return
    setEvento(null); setEstado('no')
    try { await e.prompt(); await e.userChoice } catch { /* evento ya usado */ }
  }

  return (
    <div className="asegura-instalar mb-1">
      <button type="button" onClick={pulsar} aria-expanded={estado === 'ios' ? verIos : undefined}
        className="asegura-instalar-boton">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
        </svg>
        Instalar la app
      </button>
      {estado === 'ios' && verIos && (
        <p role="note" className="mx-auto mt-1 max-w-xs rounded-[12px] border border-line bg-card px-3 py-2 text-left text-sm text-ink-2">
          En Safari toca <strong>Compartir</strong> (o el menú <strong>···</strong>) y elige <strong>«Añadir a pantalla de inicio»</strong>.
        </p>
      )}
    </div>
  )
}
