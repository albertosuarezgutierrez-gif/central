'use client'
import { useEffect, useState } from 'react'

import { DIAS_ANTELACION_OPCIONES, UMBRALES_SUBIDA_PRIMA, type DiasAntelacion, type UmbralSubidaPrima } from '@central/module-seguros-portal'

/**
 * Antelación, «no molestar» (13/10/2026) y umbral de subida de precio (fase B). Valen para todos los
 * dispositivos de la persona.
 *
 * TODO fase B: el selector de CANAL (móvil / correo / ambos) está OCULTO a propósito. Hoy «Solo por
 * correo» dejaría a la persona sin recibos, siniestros ni recordatorios por NINGÚN canal (solo existen
 * como push) y el correo de vencimiento de `apps/asegura` no lee la preferencia. La columna `canal`, el
 * helper (`motivoSinPush`) y los crons ya lo respetan; con NULL se comporta como push, igual que antes.
 * Se enseña cuando exista el envío por correo de estos avisos. Cepo:
 * `test/regression-portal-configuracion-avisos.test.ts`.
 *
 * 🚨 Cada frase de esta pantalla es una afirmación sobre el código:
 *  · La antelación solo mueve el aviso de vencimiento por notificación (no el correo ni la campana).
 *  · «No molestar»: si la franja tapa la hora a la que salen los avisos, la notificación no llega ese
 *    día (se reintenta el siguiente); en la campana se siguen viendo.
 * Si no se puede leer lo guardado, se dice y no se pintan valores por defecto como si fueran suyos.
 */
interface Config {
  diasAntelacion: DiasAntelacion
  noMolestar: { desde: string; hasta: string } | null
  umbralSubidaPrima: UmbralSubidaPrima
}

const FRANJA_SUGERIDA = { desde: '22:00', hasta: '09:00' }

type Guardado = 'reposo' | 'guardando' | 'guardado' | 'error'

export function AjustesAvisos() {
  const [config, setConfig] = useState<Config | null | 'error'>(null)
  const [estado, setEstado] = useState<Guardado>('reposo')

  useEffect(() => {
    void fetch('/api/configuracion/avisos')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Config) => setConfig({ diasAntelacion: d.diasAntelacion, noMolestar: d.noMolestar, umbralSubidaPrima: d.umbralSubidaPrima }))
      .catch(() => setConfig('error'))
  }, [])

  if (config === null) return null
  if (config === 'error') {
    return <p className="campana-prefs-error">No hemos podido leer cómo tienes configurados los avisos. Vuelve a intentarlo en un rato.</p>
  }

  const guardar = async (cambio: Partial<Config>) => {
    const antes = config
    setConfig({ ...config, ...cambio })
    setEstado('guardando')
    const r = await fetch('/api/configuracion/avisos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cambio),
    }).catch(() => null)
    if (r?.ok) {
      setEstado('guardado')
    } else {
      // Vuelve a lo que de verdad está guardado: dejar el valor nuevo pintado mentiría.
      setConfig(antes)
      setEstado('error')
    }
  }

  return (
    <div className="config-ajustes">
      <label className="config-campo">
        <span>Avisarme del vencimiento con</span>
        <select
          value={config.diasAntelacion}
          disabled={estado === 'guardando'}
          onChange={(e) => void guardar({ diasAntelacion: Number(e.target.value) as DiasAntelacion })}
        >
          {DIAS_ANTELACION_OPCIONES.map((d) => (
            <option key={d} value={d}>
              {d} días de margen
            </option>
          ))}
        </select>
      </label>
      <p className="suave config-nota">
        Cuenta hacia atrás desde el último día en que puedes decidir si renuevas (30 días antes del vencimiento).
        Cambia el aviso por notificación. También vale para las pólizas de las personas que te han dado acceso.
      </p>

      <label className="config-campo">
        <span>Avisarme si el precio de un seguro sube más de</span>
        <select
          value={config.umbralSubidaPrima}
          disabled={estado === 'guardando'}
          onChange={(e) => void guardar({ umbralSubidaPrima: Number(e.target.value) as UmbralSubidaPrima })}
        >
          {UMBRALES_SUBIDA_PRIMA.map((u) => (
            <option key={u} value={u}>
              un {u}%
            </option>
          ))}
        </select>
      </label>
      <p className="suave config-nota">
        Comparamos el precio anual con el último que vimos de esa misma póliza. Si cambia la forma de pago
        (por ejemplo, de anual a mensual) no lo comparamos, porque no serían cifras equivalentes.
      </p>

      <fieldset className="campana-prefs">
        <legend>No molestar</legend>
        <label>
          <input
            type="checkbox"
            checked={config.noMolestar !== null}
            disabled={estado === 'guardando'}
            onChange={(e) => void guardar({ noMolestar: e.target.checked ? FRANJA_SUGERIDA : null })}
          />
          No mandarme notificaciones en una franja horaria
        </label>
        {config.noMolestar && <Franja franja={config.noMolestar} deshabilitado={estado === 'guardando'} guardar={guardar} />}
        <p className="suave config-nota">
          Hora de España peninsular. Si la franja coincide con la hora a la que mandamos los avisos, ese día no te llega
          la notificación; los sigues viendo en la campana del portal.
        </p>
      </fieldset>

      <p className="consentimiento-estado" role="status" aria-live="polite">
        {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado.' : estado === 'error' ? 'No se ha podido guardar el cambio. Inténtalo de nuevo.' : ''}
      </p>
    </div>
  )
}

function Franja({
  franja,
  deshabilitado,
  guardar,
}: {
  franja: { desde: string; hasta: string }
  deshabilitado: boolean
  guardar: (c: Partial<Config>) => Promise<void>
}) {
  const [desde, setDesde] = useState(franja.desde)
  const [hasta, setHasta] = useState(franja.hasta)
  const iguales = desde === hasta
  const cambiada = desde !== franja.desde || hasta !== franja.hasta

  return (
    <div className="config-franja">
      <label className="config-campo">
        <span>Desde</span>
        <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={deshabilitado} />
      </label>
      <label className="config-campo">
        <span>Hasta</span>
        <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} disabled={deshabilitado} />
      </label>
      {iguales && <p className="campana-prefs-error">Las dos horas no pueden ser la misma.</p>}
      {cambiada && !iguales && (
        <button type="button" className="boton secundario" disabled={deshabilitado} onClick={() => void guardar({ noMolestar: { desde, hasta } })}>
          Guardar franja
        </button>
      )}
    </div>
  )
}
