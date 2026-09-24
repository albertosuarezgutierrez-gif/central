'use client'
// «Tu ventana para decidir» — widget de las páginas de ramo.
//
// Una fecha y se pinta la barra de los 90 días antes del vencimiento con los
// dos plazos del art. 22 LCS (`lib/ventana-renovacion.ts`, que es lo que se
// testea). Da el valor ANTES de pedir nada: no guarda la fecha ni la manda a
// ningún servidor. El paso siguiente es guardarla en el área del cliente.
//
// Solo cita plazos. No promete ahorro ni afirma qué pasa si la compañía no
// avisa a tiempo: eso no está confirmado y sería asesorar.
//
// `hoy` se fija tras montar (como `CalculadoraVencimientos`) para que el HTML
// servido no lleve una fecha que ya no es hoy.
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { fechaCorta } from '@/lib/calculadora-vencimientos'
import { calcularVentana, POS, type Ventana } from '@/lib/ventana-renovacion'
import { PORTAL_URL } from '@/lib/sitio'
import { medir } from '@/lib/medir'
import EnlaceMedido from '@/components/EnlaceMedido'

type Props = { ramo: string }

function dias(n: number): string {
  return n === 1 ? '1 día' : `${n} días`
}

function Mensaje({ v }: { v: Ventana }) {
  if (v.fase === 'tarde') {
    return (
      <p>
        El plazo para oponerte a la prórroga de este año terminó el <strong>{fechaCorta(v.limite)}</strong>: la póliza
        se renueva el {fechaCorta(v.vence)}. Apunta la siguiente: la ventana vuelve a abrirse dos meses antes del
        vencimiento de {v.vence.getUTCFullYear() + 1}.
      </p>
    )
  }
  if (v.fase === 'ventana') {
    return (
      <p>
        <strong>Estás dentro de la ventana.</strong> Hasta el <strong>{fechaCorta(v.limite)}</strong> (
        {dias(v.diasHastaLimite)}) puedes comunicar a tu compañía que no quieres renovar. Si te ha avisado de algún
        cambio de precio o de condiciones, este es el momento de revisarlo.
      </p>
    )
  }
  return (
    <p>
      Tu compañía tiene hasta el <strong>{fechaCorta(v.avisoCompania)}</strong> para comunicarte cualquier cambio de
      precio o de condiciones. Desde ese día y hasta el <strong>{fechaCorta(v.limite)}</strong> decides si renuevas.
      Quedan {dias(v.diasHastaVentana)} para que se abra.
    </p>
  )
}

export default function VentanaRenovacion({ ramo }: Props) {
  const [vence, setVence] = useState('')
  const [hoy, setHoy] = useState<Date | null>(null)
  useEffect(() => setHoy(new Date()), [])

  const v = hoy ? calcularVentana(vence, hoy) : null

  // Un evento por visita: el primer resultado válido, no cada tecla.
  const medido = useRef(false)
  const fase = v?.fase ?? null
  useEffect(() => {
    if (medido.current || !fase) return
    medido.current = true
    medir('ventana_calculo', { ramo, fase })
  }, [fase, ramo])

  const hito = (pos: number): CSSProperties => ({ left: `${pos}%` })

  return (
    <section className="panel ventana" aria-labelledby="ventana-t">
      <p className="antetitulo" style={{ display: 'block' }}>
        Tu ventana para decidir
      </p>
      <h2 id="ventana-t" style={{ marginTop: 4 }}>
        ¿Cuándo vence tu póliza?
      </h2>
      <p className="tenue" style={{ marginTop: 0 }}>
        La ley pone dos plazos antes de cada renovación: la compañía tiene que avisarte de cualquier cambio con dos
        meses de antelación, y tú puedes decir que no renuevas hasta un mes antes. Lo que queda entre los dos es tu
        margen para decidir.
      </p>

      <label className="f-lab" htmlFor="ventana-fecha">
        Fecha de vencimiento (la de tu póliza o tu último recibo)
      </label>
      <input
        id="ventana-fecha"
        className="f-in"
        type="date"
        value={vence}
        onChange={(e) => setVence(e.target.value)}
        style={{ maxWidth: 260 }}
      />

      {v && (
        <div aria-live="polite" style={{ marginTop: 20 }}>
          <div className="ventana-barra" role="img" aria-label={`Del ${fechaCorta(v.avisoCompania)} al ${fechaCorta(v.limite)}: tu ventana para decidir`}>
            <div className="ventana-tramo ventana-tramo--antes" style={{ width: `${POS.avisoCompania}%` }} />
            <div
              className="ventana-tramo ventana-tramo--ventana"
              style={{ left: `${POS.avisoCompania}%`, width: `${POS.limite - POS.avisoCompania}%` }}
            />
            <div className="ventana-tramo ventana-tramo--tarde" style={{ left: `${POS.limite}%`, right: 0 }} />
            {v.posHoy !== null && (
              <div className="ventana-hoy" style={hito(v.posHoy)}>
                <span>Hoy</span>
              </div>
            )}
          </div>

          <ol className="ventana-hitos">
            <li>
              <strong>{fechaCorta(v.avisoCompania)}</strong>
              <span>Último día para que tu compañía te avise de cambios</span>
            </li>
            <li className="ventana-hito--clave">
              <strong>{fechaCorta(v.limite)}</strong>
              <span>Último día para decir que no renuevas</span>
            </li>
            <li>
              <strong>{fechaCorta(v.vence)}</strong>
              <span>Vencimiento: si no has dicho nada, se renueva sola</span>
            </li>
          </ol>

          {v.avanzada && (
            <p className="tenue" style={{ fontSize: 14 }}>
              La fecha que has puesto ya pasó; la póliza se prorroga cada año el mismo día, así que usamos la del{' '}
              {fechaCorta(v.vence)}.
            </p>
          )}
          <Mensaje v={v} />

          <div className="hero-cta" style={{ marginTop: 16 }}>
            <EnlaceMedido href={PORTAL_URL} origen={`ramo_ventana_${ramo}`} className="btn btn-brand" style={{ minHeight: 44 }}>
              Guardar esta fecha en mi área
            </EnlaceMedido>
          </div>
          <p className="tenue" style={{ fontSize: 14, margin: '10px 0 0' }}>
            Aquí la fecha no se guarda. En tu área la tienes siempre a la vista, con la póliza al lado.
          </p>
        </div>
      )}
    </section>
  )
}
