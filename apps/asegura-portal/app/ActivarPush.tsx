'use client'
import { useEffect, useState } from 'react'

import { TEXTO_CONSENTIMIENTO_AVISOS } from '@central/module-seguros-portal'

import { decidirVistaPush, type VistaPush } from '@/lib/push-estado'

import { InstruccionesIOS, useInstalacion } from './instalacion'
import { CLAVE_PUBLICA, activarEnEsteDispositivo, desactivarEnEsteDispositivo, leerDispositivo, type LecturaDispositivo } from './push-cliente'

/**
 * Interruptor de avisos por notificación push en ESTE dispositivo. Desde el 13/10/2026 vive en
 * «Configuración → Avisos» (`/configuracion`); la campana solo enlaza aquí.
 *
 * Qué se enseña lo decide `decidirVistaPush` (`lib/push-estado.ts`, puro y con test): activadas,
 * desactivadas o «bloqueadas por el navegador» (permiso denegado: se explica cómo desbloquear, sin
 * botón de reintento que no puede funcionar). Sin soporte NO se calla: en iPhone/iPad sin instalar se
 * manda a instalar la app (la guía es `InstruccionesIOS` de `instalacion.tsx`, la misma de la barra;
 * el `ios` de `useInstalacion` ya significa «iOS y no instalada»), y en un navegador sin soporte se
 * dice. Sin `NEXT_PUBLIC_VAPID_PUBLIC_KEY` se dice que no está disponible: ahí el fallo es nuestro.
 *
 * 🚨 Junto al botón de activar va `TEXTO_CONSENTIMIENTO_AVISOS`: activar sella el consentimiento
 * `avisos` con su versión (`push-cliente.ts` → `/api/push/suscribir`). Leer y suscribir lo hace
 * `push-cliente.ts`, el mismo que usa la bienvenida (`BienvenidaAvisos.tsx`).
 */
type Accion = 'reposo' | 'trabajando' | 'error' | 'error_desactivar'

/** Táctil ≥44 px: los botones de este panel son del tamaño de un dedo, no de un enlace. */
const BOTON: React.CSSProperties = { minHeight: 44, padding: '0 4px', textAlign: 'left' }
const TEXTO: React.CSSProperties = { fontSize: 14, color: 'var(--muted)', margin: '0 0 8px', lineHeight: 1.5 }

export function ActivarPush() {
  const instalacion = useInstalacion()
  const [lectura, setLectura] = useState<LecturaDispositivo | null>(null)
  const [accion, setAccion] = useState<Accion>('reposo')
  const [guiaAbierta, setGuiaAbierta] = useState(false)

  useEffect(() => {
    void leerDispositivo().then((l) => {
      setLectura(l)
      if (l.fallo) setAccion('error')
    })
  }, [])

  // Hasta saber qué navegador es (la instalación se decide tras montar) no se pinta nada: evita
  // enseñar «no admite avisos» un instante a quien está en iPhone.
  if (lectura === null || instalacion === 'indeterminado') return null

  const vista: VistaPush = decidirVistaPush({
    ...lectura,
    clavePublica: Boolean(CLAVE_PUBLICA),
    iosSinInstalar: instalacion === 'ios',
  })

  if (vista === 'sin_configurar') {
    return (
      <div className="campana-push">
        <p style={TEXTO}>Las notificaciones no están disponibles ahora mismo en el portal.</p>
      </div>
    )
  }

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
    const r = await activarEnEsteDispositivo()
    if (r === 'activadas') {
      setLectura((l) => (l ? { ...l, permiso: 'granted', suscripcionLocal: true } : l))
      setAccion('reposo')
    } else if (r === 'denegado') {
      // `denied` pinta «bloqueadas» (sin reintento).
      setLectura((l) => (l ? { ...l, permiso: 'denied' } : l))
      setAccion('reposo')
    } else if (r === 'sin_elegir') {
      // Cerró el diálogo sin elegir: vuelve el botón.
      setAccion('reposo')
    } else {
      setAccion('error')
    }
  }

  const desactivar = async () => {
    setAccion('trabajando')
    try {
      await desactivarEnEsteDispositivo()
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
          <p style={TEXTO}>Notificaciones en este dispositivo: <strong>activadas</strong>.</p>
          <button type="button" className="campana-reintentar" style={BOTON} onClick={desactivar} disabled={accion === 'trabajando'}>
            {accion === 'error_desactivar' ? 'No se han podido desactivar — reintentar' : 'Desactivar en este dispositivo'}
          </button>
        </>
      ) : (
        <>
          <p style={TEXTO}>Notificaciones en este dispositivo: <strong>desactivadas</strong>.</p>
          <p style={TEXTO}>{TEXTO_CONSENTIMIENTO_AVISOS}</p>
          <button type="button" className="campana-reintentar" style={BOTON} onClick={activar} disabled={accion === 'trabajando'}>
            {accion === 'error' ? 'No se ha podido activar — reintentar' : 'Acepto: activar las notificaciones'}
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
  { tipo: 'subida_prima', texto: 'Subidas de precio de tus seguros' },
  { tipo: 'vencimiento_aportada', texto: 'Vencimiento de las pólizas que has añadido tú (con la opción de pedir una comparativa)' },
  { tipo: 'vencimiento_autorizado', texto: 'Avisarme también de las pólizas de las personas que me han dado acceso' },
]

/**
 * Qué novedades de la compañía (llegan por CIMA) avisa la notificación. Valen para TODOS tus
 * dispositivos, por eso «Configuración» las pinta aparte del interruptor de este. Si no se pueden
 * leer se DICE — unas casillas pintadas por defecto mentirían sobre lo que de verdad está guardado.
 */
export function PreferenciasAvisos() {
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
