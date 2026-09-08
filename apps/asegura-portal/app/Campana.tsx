'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { Avisos } from '@/lib/avisos'

import { instalar, InstruccionesIOS, useInstalacion } from './instalacion'

/**
 * La campana de la cabecera: lo que la persona tiene pendiente, en un solo
 * sitio, con un número encima.
 *
 * ── Por qué existe (08/09/2026, idea de Alberto) ────────────────────────────
 * «María autoriza a Gabriel a ver sus seguros» nacía pendiente y Gabriel solo se
 * enteraba si entraba en la pestaña «Quién me ve». Si venía a mirar su póliza y
 * no abría esa pestaña, la autorización se quedaba ahí sin que nada fallara.
 * Alberto: «un icono de campana de avisos, para autorizaciones, vencimientos,
 * etc.». Y de paso, la instalación de la app, que tras descartar la franja no
 * tenía otro sitio.
 *
 * 🚨 UNA CAMPANA ESCONDE; LO QUE LA SALVA ES EL NÚMERO. Este portal renunció a
 * la hamburguesa porque «un botón que las esconde detrás de un toque las hace
 * menos visibles que enseñarlas» (`NavPortal.tsx`) y lo usa gente de 50-70
 * años. Una autorización detrás de un icono sin número sería lo mismo que hoy
 * en `/autorizaciones`: no se ve. Por eso el globo va SIEMPRE que haya algo, y
 * tiene tres desenlaces que decide `lib/avisos.ts`: `n` · `n+` (alguna fuente
 * ilegible) · `!` (ninguna legible). Un fallo de red también es `!`: «sin
 * avisos» sobre algo que no se ha leído es la mentira que el repo persigue.
 *
 * 🚨 AQUÍ NO SE ACEPTA NADA. Cada aviso es un ENLACE a la pantalla donde se
 * resuelve (la autorización a «Quién me ve», con su alcance y su texto delante;
 * el vencimiento al calendario). Un «Aceptar» en el panel sería aceptar sin
 * leer, y duplicaría en dos componentes lo que `Autorizaciones.tsx` ya hace.
 *
 * El panel se pone ENCIMA del contenido a propósito (es un desplegable que se
 * cierra al pulsar fuera o Escape), y por eso no cuenta para la medida de
 * desbordamiento: se mide que el panel quepa en la pantalla, no que no tape.
 */
export function Campana() {
  const [datos, setDatos] = useState<Avisos | 'error' | null>(null)
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const idPanel = useId()
  const instalacion = useInstalacion()

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/avisos', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      setDatos((await r.json()) as Avisos)
    } catch {
      setDatos('error')
    }
  }, [])

  // Al montar y cada vez que se abre: lo que hay pendiente cambia al aceptar o
  // revocar en otra pestaña, y no hay push que lo cuente.
  useEffect(() => {
    void cargar()
  }, [cargar])
  useEffect(() => {
    if (abierto) void cargar()
  }, [abierto, cargar])

  // Cerrar al pulsar fuera o con Escape: un desplegable que solo se cierra con
  // su propio botón se queda tapando la póliza.
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  // El número también en el icono de la app instalada: es lo que hace que
  // instalar sirva de algo, ve que hay algo sin abrir nada. Solo un número
  // cierto: con `+` o `!` se pone un punto (sin cifra), que es lo que la API
  // hace con `setAppBadge()` sin argumento.
  const globo = datos === 'error' ? '!' : (datos?.globo ?? null)
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge || !nav.clearAppBadge) return
    try {
      if (globo === null) void nav.clearAppBadge().catch(() => {})
      else if (/^\d+$/.test(globo)) void nav.setAppBadge(Number(globo)).catch(() => {})
      else void nav.setAppBadge().catch(() => {})
    } catch {
      // Sin permiso o sin soporte: la campana de la cabecera sigue diciéndolo.
    }
  }, [globo])

  const n = datos !== null && datos !== 'error' ? datos.avisos.length : null
  const etiqueta =
    globo === null
      ? 'Avisos: nada pendiente'
      : globo === '!'
        ? 'Avisos: no se han podido leer'
        : `Avisos: ${n ?? 0} pendiente${n === 1 ? '' : 's'}${globo.endsWith('+') ? ', puede haber más' : ''}`

  return (
    <div className="campana" ref={raiz}>
      <button
        type="button"
        className="campana-boton"
        aria-label={etiqueta}
        title="Avisos"
        aria-expanded={abierto}
        aria-controls={idPanel}
        data-globo={globo ?? undefined}
        onClick={() => setAbierto((a) => !a)}
      >
        <IconoCampana />
        {globo !== null && (
          <span className="campana-globo" aria-hidden="true">
            {globo}
          </span>
        )}
      </button>
      {abierto && (
        <div className="campana-panel" id={idPanel} role="region" aria-label="Avisos">
          <Contenido datos={datos} reintentar={cargar} cerrar={() => setAbierto(false)} />
          {(instalacion === 'instalable' || instalacion === 'ios') && (
            <div className="campana-instalar">
              <strong>Tenlo a mano</strong>
              {instalacion === 'ios' ? (
                <p>
                  <InstruccionesIOS />
                </p>
              ) : (
                <button type="button" className="campana-instalar-boton" onClick={() => void instalar()}>
                  Instalar «Mis seguros» en este dispositivo
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Contenido({
  datos,
  reintentar,
  cerrar,
}: {
  datos: Avisos | 'error' | null
  reintentar: () => void
  cerrar: () => void
}) {
  if (datos === null) return <p className="campana-vacio">Mirando qué tienes pendiente…</p>
  if (datos === 'error') {
    return (
      <p className="campana-vacio campana-ilegible">
        No se han podido leer tus avisos.{' '}
        <button type="button" className="campana-reintentar" onClick={reintentar}>
          Volver a intentarlo
        </button>
      </p>
    )
  }
  const ilegibles = datos.fuentesIlegibles
  return (
    <>
      {datos.avisos.length > 0 ? (
        <ul className="campana-lista">
          {datos.avisos.map((a) => (
            <li key={a.id}>
              {/* `<a>` y no `<Link>`: el destino puede llevar `#` a un titular
                  de la misma página, y la navegación blanda de Next no vuelve
                  a hacer scroll al ancla si ya estás en `/boveda`. */}
              <a className="campana-aviso" href={a.href} onClick={cerrar}>
                <span className="campana-aviso-titulo">{a.titulo}</span>
                <span className="campana-aviso-detalle">{a.detalle}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        ilegibles.length === 0 && <p className="campana-vacio">No tienes nada pendiente.</p>
      )}
      {ilegibles.length > 0 && (
        <p className="campana-vacio campana-ilegible">
          {/* Se nombra QUÉ no se ha leído: «puede haber más» a secas no dice
              dónde mirar mientras tanto. */}
          No se han podido leer {ilegibles.map(nombreFuente).join(' ni ')}: puede haber más avisos.{' '}
          <button type="button" className="campana-reintentar" onClick={reintentar}>
            Volver a intentarlo
          </button>
        </p>
      )}
    </>
  )
}

function nombreFuente(f: Avisos['fuentesIlegibles'][number]): string {
  return f === 'autorizaciones' ? 'las autorizaciones' : 'los vencimientos'
}

// En línea, no de una librería: es un icono, y el portal lo abre gente desde el
// móvil con datos. Trazo con `currentColor` para que siga al tema.
function IconoCampana() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}
