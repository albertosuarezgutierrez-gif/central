'use client'
import { useEffect, useState } from 'react'

import { TEXTO_CONSENTIMIENTO_AVISOS } from '@central/module-seguros-portal'

import { decidirBienvenidaAvisos, decidirVistaPush, type Bienvenida, type VistaPospuesta } from '@/lib/push-estado'

import { InstruccionesIOS, useInstalacion } from '../instalacion'
import { CLAVE_PUBLICA, activarEnEsteDispositivo, leerDispositivo } from '../push-cliente'

/**
 * Bienvenida de avisos (13/10/2026, «soft-ask»): un panel PROPIO antes del diálogo del navegador.
 *
 * 🚨 El diálogo del navegador solo se puede enseñar una vez: si la persona dice «Bloquear», ya no hay
 * forma de volver a preguntar desde la página. Por eso `Notification.requestPermission()` solo se
 * llama al pulsar «Sí, avisarme» aquí (o «Activar» en Configuración), nunca al cargar.
 *
 * Cuándo se enseña lo decide `decidirBienvenidaAvisos` (`lib/push-estado.ts`, puro y con test):
 *  · solo si en ESTE dispositivo se puede activar (o es un iPhone sin instalar: guía de instalación);
 *  · nunca con el permiso ya «denegado» (lo explica Configuración) ni en la vista de corredor;
 *  · «Ahora no» se guarda en la BD (`POST /api/configuracion/bienvenida`) y la tapa 14 días en todos
 *    los dispositivos, salvo que se dijera a la guía de iPhone y ya esté instalada.
 * Si no se puede leer el estado guardado, NO se enseña: preguntar de más es peor que preguntar tarde.
 */
const CLAVE_SESION = 'asegura-bienvenida-avisos-cerrada'

function cerradaEnEstaSesion(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_SESION) === '1'
  } catch {
    return false
  }
}

function marcarCerrada() {
  try {
    sessionStorage.setItem(CLAVE_SESION, '1')
  } catch {
    // Sin almacenamiento: la BD ya guarda el «Ahora no»; esto solo evita re-preguntar en la misma visita.
  }
}

type Estado = 'oculta' | Exclude<Bienvenida, 'no'> | 'trabajando' | 'error' | 'hecho'

export function BienvenidaAvisos() {
  const instalacion = useInstalacion()
  const [estado, setEstado] = useState<Estado>('oculta')

  useEffect(() => {
    if (instalacion === 'indeterminado' || cerradaEnEstaSesion()) return
    let vivo = true
    void (async () => {
      const lectura = await leerDispositivo()
      if (lectura.fallo) return
      const vista = decidirVistaPush({ ...lectura, clavePublica: Boolean(CLAVE_PUBLICA), iosSinInstalar: instalacion === 'ios' })
      if (vista !== 'inactivas' && vista !== 'instalar_ios') return
      const r = await fetch('/api/configuracion/avisos').catch(() => null)
      if (!r?.ok) return
      const c = (await r.json().catch(() => null)) as {
        corredor?: boolean
        bienvenida?: { pospuestaEn: string | null; pospuestaVista: VistaPospuesta | null }
      } | null
      if (!c?.bienvenida || typeof c.corredor !== 'boolean') return
      const decision = decidirBienvenidaAvisos({
        vista,
        corredor: c.corredor,
        pospuestaEn: c.bienvenida.pospuestaEn ? new Date(c.bienvenida.pospuestaEn) : null,
        pospuestaVista: c.bienvenida.pospuestaVista,
        ahora: new Date(),
      })
      if (vivo && decision !== 'no') setEstado(decision)
    })()
    return () => {
      vivo = false
    }
  }, [instalacion])

  if (estado === 'oculta') return null

  const vistaPospuesta: VistaPospuesta = estado === 'guiar_ios' ? 'instalar_ios' : 'inactivas'

  const ahoraNo = () => {
    marcarCerrada()
    setEstado('oculta')
    // Si no se guarda, lo peor es volver a preguntar en otra visita: no se le hace esperar.
    void fetch('/api/configuracion/bienvenida', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vista: vistaPospuesta }),
    }).catch(() => {})
  }

  const si = async () => {
    setEstado('trabajando')
    const r = await activarEnEsteDispositivo()
    if (r === 'activadas') {
      marcarCerrada()
      setEstado('hecho')
    } else if (r === 'denegado') {
      // Ya no se puede volver a preguntar: Configuración explica cómo desbloquearlo.
      marcarCerrada()
      setEstado('oculta')
    } else if (r === 'sin_elegir') {
      // Cerró el diálogo sin elegir: cuenta como «Ahora no».
      ahoraNo()
    } else {
      setEstado('error')
    }
  }

  return (
    <section className="seccion bienvenida-avisos" aria-labelledby="bienvenida-avisos-titulo" role="region">
      <p className="antetitulo">Avisos</p>
      <h2 id="bienvenida-avisos-titulo">¿Te avisamos cuando venza una póliza o te devuelvan un recibo?</h2>

      {estado === 'hecho' ? (
        <>
          <p className="suave">
            Listo: te avisaremos en este dispositivo. Puedes cambiar qué te avisamos y cuándo en{' '}
            <a href="/configuracion#avisos">Configuración</a>.
          </p>
          <div className="bienvenida-avisos-botones">
            <button type="button" className="boton secundario" onClick={() => setEstado('oculta')}>
              Cerrar
            </button>
          </div>
        </>
      ) : estado === 'guiar_ios' ? (
        <>
          <p className="suave">
            En iPhone los avisos solo llegan si instalas la app en tu pantalla de inicio. Son dos toques:
          </p>
          <InstruccionesIOS />
          <p className="suave">Cuando la abras desde el icono, te preguntaremos aquí mismo.</p>
          <div className="bienvenida-avisos-botones">
            <button type="button" className="boton secundario" onClick={ahoraNo}>
              Ahora no
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="suave">{TEXTO_CONSENTIMIENTO_AVISOS}</p>
          {estado === 'error' && (
            <p className="suave" role="alert">
              No se han podido activar. Puedes reintentarlo o hacerlo más tarde desde Configuración.
            </p>
          )}
          <div className="bienvenida-avisos-botones">
            <button type="button" className="boton" onClick={() => void si()} disabled={estado === 'trabajando'}>
              {estado === 'error' ? 'Reintentar' : 'Sí, avisarme'}
            </button>
            <button type="button" className="boton secundario" onClick={ahoraNo} disabled={estado === 'trabajando'}>
              Ahora no
            </button>
          </div>
        </>
      )}
    </section>
  )
}
