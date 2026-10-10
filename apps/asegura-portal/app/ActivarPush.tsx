'use client'
import { useEffect, useState } from 'react'

import { decidirVistaPush, type PermisoNotificaciones, type VistaPush } from '@/lib/push-estado'

import { InstruccionesIOS, useInstalacion } from './instalacion'

/**
 * Interruptor de avisos por notificación push (12/09/2026), dentro del panel de la campana: es el
 * sitio natural — «avisos» es justo lo que esto añade como canal.
 *
 * Qué se enseña lo decide `decidirVistaPush` (`lib/push-estado.ts`, puro y con test): activadas,
 * desactivadas o «bloqueadas por el navegador» (permiso denegado: se explica cómo desbloquear, sin
 * botón de reintento que no puede funcionar). Sin soporte NO se calla: en iPhone/iPad sin instalar se
 * manda a instalar la app (la guía es `InstruccionesIOS` de `instalacion.tsx`, la misma de la barra;
 * el `ios` de `useInstalacion` ya significa «iOS y no instalada»), y en un navegador sin soporte se
 * dice. Solo sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY` no se pinta nada: ahí el fallo es nuestro.
 * `RegistrarSW` ya registró el service worker en el layout raíz; aquí solo se pide permiso y se
 * suscribe sobre él.
 */
interface Lectura {
  serviceWorker: boolean
  pushManager: boolean
  notificaciones: boolean
  permiso: PermisoNotificaciones | null
  suscripcionLocal: boolean
}

type Accion = 'reposo' | 'trabajando' | 'error' | 'error_desactivar'

const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** Táctil ≥44 px: los botones de este panel son del tamaño de un dedo, no de un enlace. */
const BOTON: React.CSSProperties = { minHeight: 44, padding: '0 4px', textAlign: 'left' }
const TEXTO: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: '0 0 6px', lineHeight: 1.45 }

function leerPermiso(): PermisoNotificaciones | null {
  try {
    return typeof Notification === 'undefined' ? null : Notification.permission
  } catch {
    return null
  }
}

export function ActivarPush() {
  const instalacion = useInstalacion()
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [accion, setAccion] = useState<Accion>('reposo')
  const [guiaAbierta, setGuiaAbierta] = useState(false)

  useEffect(() => {
    void (async () => {
      const base = {
        serviceWorker: 'serviceWorker' in navigator,
        pushManager: 'PushManager' in window,
        notificaciones: 'Notification' in window,
        permiso: leerPermiso(),
      }
      if (!base.serviceWorker || !base.pushManager || !base.notificaciones) {
        setLectura({ ...base, suscripcionLocal: false })
        return
      }
      try {
        const registro = await navigator.serviceWorker.ready
        const sub = await registro.pushManager.getSubscription()
        setLectura({ ...base, suscripcionLocal: sub !== null })
      } catch {
        setLectura({ ...base, suscripcionLocal: false })
        setAccion('error')
      }
    })()
  }, [])

  // Hasta saber qué navegador es (la instalación se decide tras montar) no se pinta nada: evita
  // enseñar «no admite avisos» un instante a quien está en iPhone.
  if (lectura === null || instalacion === 'indeterminado') return null

  const vista: VistaPush = decidirVistaPush({
    ...lectura,
    clavePublica: Boolean(CLAVE_PUBLICA),
    iosSinInstalar: instalacion === 'ios',
  })

  if (vista === 'sin_configurar') return null

  if (vista === 'instalar_ios') {
    return (
      <div className="campana-push">
        <p style={TEXTO}>Para recibir avisos en iPhone, instala la app en tu pantalla de inicio.</p>
        <button
          type="button"
          className="campana-reintentar"
          style={BOTON}
          aria-expanded={guiaAbierta}
          onClick={() => setGuiaAbierta((a) => !a)}
        >
          {guiaAbierta ? 'Ocultar los pasos' : 'Ver cómo instalarla'}
        </button>
        {guiaAbierta && <InstruccionesIOS />}
      </div>
    )
  }

  if (vista === 'sin_soporte') {
    return (
      <div className="campana-push">
        <p style={TEXTO}>Tu navegador no admite avisos.</p>
      </div>
    )
  }

  if (vista === 'bloqueadas') {
    return (
      <div className="campana-push">
        <p style={TEXTO}>
          Los avisos están <strong>bloqueados por el navegador</strong>. Para recibirlos, permite las notificaciones de
          esta página en los ajustes del sitio (el icono junto a la dirección o, en el móvil, los ajustes del
          navegador o de la app) y vuelve a abrir esta pantalla.
        </p>
      </div>
    )
  }

  const activar = async () => {
    setAccion('trabajando')
    try {
      const permiso = leerPermiso() === 'granted' ? 'granted' : await Notification.requestPermission()
      setLectura((l) => (l ? { ...l, permiso } : l))
      if (permiso !== 'granted') {
        // `denied` pinta «bloqueadas» (sin reintento); `default` (lo cerró sin elegir) vuelve al botón.
        setAccion('reposo')
        return
      }
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CLAVE_PUBLICA!),
      })
      const r = await fetch('/api/push/suscribir', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!r.ok) throw new Error(String(r.status))
      setLectura((l) => (l ? { ...l, suscripcionLocal: true } : l))
      setAccion('reposo')
    } catch {
      setAccion('error')
    }
  }

  const desactivar = async () => {
    setAccion('trabajando')
    try {
      const registro = await navigator.serviceWorker.ready
      const sub = await registro.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/desuscribir', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setLectura((l) => (l ? { ...l, suscripcionLocal: false } : l))
      setAccion('reposo')
    } catch {
      // Sigue activa: se vuelve a enseñar «Desactivar» con el aviso, no el botón de ACTIVAR con
      // «No se ha podido activar», que era lo que salía (29/09/2026).
      setAccion('error_desactivar')
    }
  }

  return (
    <div className="campana-push">
      {vista === 'activas' ? (
        <>
          <p style={TEXTO}>Avisos por notificación: <strong>activados</strong>.</p>
          <PreferenciasAvisos />
          <button type="button" className="campana-reintentar" style={BOTON} onClick={desactivar} disabled={accion === 'trabajando'}>
            {accion === 'error_desactivar' ? 'No se han podido desactivar — reintentar' : 'Desactivar avisos por notificación'}
          </button>
        </>
      ) : (
        <>
          <p style={TEXTO}>Avisos por notificación: <strong>desactivados</strong>.</p>
          <button type="button" className="campana-reintentar" style={BOTON} onClick={activar} disabled={accion === 'trabajando'}>
            {accion === 'error' ? 'No se ha podido activar — reintentar' : 'Avisarme también con una notificación'}
          </button>
        </>
      )}
    </div>
  )
}

const TIPOS: { tipo: string; texto: string }[] = [
  { tipo: 'recibo_devuelto', texto: 'Recibo devuelto' },
  { tipo: 'recibo_nuevo', texto: 'Recibo nuevo al cobro' },
  { tipo: 'siniestro', texto: 'Novedades de un siniestro' },
  { tipo: 'poliza_nueva', texto: 'Póliza nueva (y cambios de compañía)' },
  { tipo: 'poliza_modificada', texto: 'Cambios en tus pólizas (precio, fechas, coberturas…)' },
]

/**
 * Qué novedades de la compañía (llegan por CIMA) avisa la notificación. Solo se pinta con el push
 * activo: sin él no hay nada que elegir. Si no se pueden leer se DICE — unas casillas pintadas por
 * defecto mentirían sobre lo que de verdad está guardado.
 */
function PreferenciasAvisos() {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null | 'error'>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    void fetch('/api/push/preferencias')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { preferencias: Record<string, boolean> }) => setPrefs(d.preferencias))
      .catch(() => setPrefs('error'))
  }, [])

  if (prefs === null) return null
  if (prefs === 'error') return <p className="campana-prefs-error">No hemos podido leer qué avisos tienes activados.</p>

  const cambiar = async (tipo: string, activo: boolean) => {
    const antes = prefs
    setFallo(false)
    setPrefs({ ...prefs, [tipo]: activo })
    const r = await fetch('/api/push/preferencias', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, activo }),
    }).catch(() => null)
    if (!r?.ok) {
      setPrefs(antes)
      setFallo(true)
    }
  }

  return (
    <fieldset className="campana-prefs">
      <legend>Avisarme de</legend>
      {TIPOS.map(({ tipo, texto }) => (
        <label key={tipo}>
          <input type="checkbox" checked={prefs[tipo] ?? true} onChange={(e) => void cambiar(tipo, e.target.checked)} />
          {texto}
        </label>
      ))}
      {fallo && <p className="campana-prefs-error">No se ha podido guardar el cambio. Inténtalo de nuevo.</p>}
    </fieldset>
  )
}

/** VAPID exige la clave pública como `Uint8Array`, y el navegador la da en base64url. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const salida = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) salida[i] = raw.charCodeAt(i)
  return salida
}
