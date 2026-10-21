'use client'
import { useEffect, useState } from 'react'

import { DIAS_ANTELACION_OPCIONES, UMBRALES_SUBIDA_PRIMA, type CanalAviso, type DiasAntelacion, type UmbralSubidaPrima } from '@central/module-seguros-portal'

import { InterruptorAvisoCarnet } from '../../InterruptorAvisoCarnet'
import { InterruptorAvisoItv } from '../../InterruptorAvisoItv'

/**
 * Antelación, «no molestar» (13/10/2026) y umbral de subida de precio (fase B). Valen para todos los
 * dispositivos de la persona.
 *
 * Selector de CANAL (fase B): solo `ambos` (por defecto) y `movil`. «Solo por correo» NO se ofrece a
 * propósito: recibos, siniestros, póliza nueva, subida de prima y recordatorios solo existen como
 * notificación, y «solo correo» dejaría a la persona sin ningún canal. La API del portal también lo
 * rechaza. Si en la BD ya hubiera `correo`, se dice y se pide elegir una de las dos (no se pinta como
 * si fuera «ambos»). Cepo: `test/regression-portal-configuracion-avisos.test.ts`.
 *
 * 🚨 Cada frase de esta pantalla es una afirmación sobre el código:
 *  · «Solo en el móvil»: el correo solo se omite si la notificación de ese ciclo salió; si no llega, se
 *    manda igualmente por correo.
 *  · La antelación mueve el aviso de vencimiento por notificación, el correo y la campana (14/10/2026). El
 *    correo y la campana nunca bajan de 7 días (`diasVentanaVencimiento`); la notificación sí baja a 3.
 *  · «No molestar»: si la franja tapa la hora a la que salen los avisos, la notificación no llega ese
 *    día (se reintenta el siguiente); en la campana se siguen viendo.
 * Si no se puede leer lo guardado, se dice y no se pintan valores por defecto como si fueran suyos.
 */
interface Config {
  canal: CanalAviso
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
      .then((d: Config) => setConfig({ canal: d.canal, diasAntelacion: d.diasAntelacion, noMolestar: d.noMolestar, umbralSubidaPrima: d.umbralSubidaPrima }))
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
        <span>Cómo quiero recibir los avisos</span>
        <select
          value={config.canal === 'movil' || config.canal === 'ambos' ? config.canal : ''}
          disabled={estado === 'guardando'}
          onChange={(e) => void guardar({ canal: e.target.value as CanalAviso })}
        >
          {config.canal !== 'movil' && config.canal !== 'ambos' && (
            <option value="" disabled>
              Elige una opción
            </option>
          )}
          <option value="ambos">En el móvil y por correo</option>
          <option value="movil">Solo en el móvil</option>
        </select>
      </label>
      {config.canal !== 'movil' && config.canal !== 'ambos' && (
        <p className="campana-prefs-error">Ahora mismo no tienes elegida una de estas dos opciones. Elige una para que sepamos cómo avisarte.</p>
      )}
      {config.canal === 'movil' && (
        <p className="suave config-nota">Si el aviso no te llega al móvil, te lo mandamos igualmente por correo.</p>
      )}

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
        Se aplica al aviso en el móvil y al correo; por correo, como mínimo te avisamos con 7 días. En el móvil
        también vale para las pólizas de las personas que te han dado acceso.
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

      <InterruptorAvisoCarnet />
      <p className="suave config-nota">
        Te lo decimos en la campana y por correo, con antelación. Lo apagas aquí o desde «Mis datos → Tus carnés de
        conducir»; no cambia nada de tus carnés guardados.
      </p>

      <InterruptorAvisoItv />
      <p className="suave config-nota">
        Calculamos la ITV con la fecha de matriculación de tu vehículo, a 30 y 7 días y el mismo día. Si la fecha es
        una estimación te lo decimos. Si ya te has puesto un recordatorio de ITV para ese coche, no te avisamos dos veces.
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
