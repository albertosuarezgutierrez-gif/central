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
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { MEDIADOR } from '@central/module-seguros'

import { fechaCorta } from '@/lib/calculadora-vencimientos'
import { calcularVentana, POS, type Ventana } from '@/lib/ventana-renovacion'
import { PORTAL_URL } from '@/lib/sitio'
import { medir } from '@/lib/medir'
import EnlaceMedido from '@/components/EnlaceMedido'
import { llamarAviso } from '@/lib/aviso'

/**
 * El paso «avísame por correo» se enseña SOLO con `NEXT_PUBLIC_AVISOS_CORREO=1`. Se enciende a la vez
 * que `ASEGURA_AVISOS_WEB_ACTIVOS=1` en asegura: si no, el visitante rellenaría un formulario que
 * contesta «no disponible».
 */
const AVISO_CORREO_ACTIVO = process.env.NEXT_PUBLIC_AVISOS_CORREO === '1'

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

          {AVISO_CORREO_ACTIVO ? (
            <AvisoPorCorreo ramo={ramo} vence={vence} />
          ) : (
            <div className="hero-cta" style={{ marginTop: 16 }}>
              <EnlaceMedido href={PORTAL_URL} origen={`ramo_ventana_${ramo}`} className="btn btn-brand" style={{ minHeight: 44 }}>
                Guardar esta fecha en mi área
              </EnlaceMedido>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

type EstadoAviso = { fase: 'idle' } | { fase: 'enviando' } | { fase: 'ok'; email: string } | { fase: 'error'; motivo: string; campo: string | null }

/**
 * Paso 2: «¿Te lo recordamos?». Nombre, correo y un consentimiento que va SIN marcar (una casilla
 * premarcada no es consentimiento). Lo que sale de aquí es un correo de confirmación: hasta que la
 * persona no lo confirma no se le escribe nada más ni entra en la cartera.
 */
function AvisoPorCorreo({ ramo, vence }: { ramo: string; vence: string }) {
  const [estado, setEstado] = useState<EstadoAviso>({ fase: 'idle' })
  const [consentimiento, setConsentimiento] = useState(false)

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (estado.fase === 'enviando') return
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get('email') ?? '').trim()
    setEstado({ fase: 'enviando' })
    const r = await llamarAviso('solicitar', { nombre: fd.get('nombre'), email, ramo, vence, consentimiento, web: fd.get('web') })
    if (r.ok) {
      medir('aviso_solicitado', { ramo })
      setEstado({ fase: 'ok', email })
    } else {
      setEstado({ fase: 'error', motivo: r.motivo ?? 'No hemos podido apuntarte. Inténtalo de nuevo.', campo: r.campo })
    }
  }

  if (estado.fase === 'ok') {
    return (
      <div className="ventana-aviso" role="status">
        <p style={{ margin: 0 }}>
          <strong>Revisa tu correo.</strong> Te hemos enviado un enlace a {estado.email} para confirmar. Hasta que no lo
          confirmes no te escribiremos nada más.
        </p>
      </div>
    )
  }

  const mal = (c: string): CSSProperties =>
    estado.fase === 'error' && estado.campo === c ? { borderColor: 'var(--danger)' } : {}

  return (
    <form className="ventana-aviso" onSubmit={enviar} noValidate>
      <h3 style={{ margin: '0 0 4px' }}>¿Te lo recordamos por correo?</h3>
      <p className="tenue" style={{ margin: '0 0 14px', fontSize: 14 }}>
        Te escribimos dos veces: a 70 días del vencimiento y a 45, antes de que se cierre el plazo para decidir.
      </p>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <div>
          <label className="f-lab" htmlFor="aviso-nombre">Nombre</label>
          <input id="aviso-nombre" name="nombre" autoComplete="given-name" className="f-in" style={mal('nombre')} />
        </div>
        <div>
          <label className="f-lab" htmlFor="aviso-email">Correo</label>
          <input id="aviso-email" name="email" type="email" inputMode="email" autoComplete="email" className="f-in" style={mal('email')} />
        </div>
      </div>
      {/* Campo trampa: fuera de pantalla, sin tabulación. Solo un bot lo rellena. */}
      <div aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="aviso-web">No rellenar</label>
        <input id="aviso-web" name="web" tabIndex={-1} autoComplete="off" />
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, margin: '14px 0 10px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={consentimiento}
          onChange={(e) => setConsentimiento(e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
        />
        <span>
          Acepto que <strong>{MEDIADOR.identidad.nombre}</strong> (Grupo ASegura) me escriba para avisarme del vencimiento
          de este seguro. Puedo darme de baja con un clic en cada correo.
        </span>
      </label>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', margin: '0 0 14px' }}>
        <strong>Responsable:</strong> {MEDIADOR.identidad.nombre} (Grupo ASegura). <strong>Finalidad:</strong> avisarte
        antes del vencimiento y, al confirmar tu correo, abrirte ficha para poder ayudarte con la renovación.{' '}
        <strong>Legitimación:</strong> tu consentimiento. <strong>Conservación:</strong> los avisos, hasta que te des de baja; tu
        ficha, un año desde el último contacto si no llegamos a trabajar juntos; sin confirmar, la solicitud se borra. <strong>Derechos:</strong> escribiendo a {MEDIADOR.identidad.email}, y
        reclamación ante la AEPD. <Link href="/legal/privacidad">Información completa</Link>.
      </p>
      {estado.fase === 'error' && (
        <p role="alert" style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          {estado.motivo}
        </p>
      )}
      <div className="hero-cta" style={{ marginTop: 0 }}>
        <button type="submit" className="btn btn-brand" style={{ minHeight: 44 }} disabled={!consentimiento || estado.fase === 'enviando'}>
          {estado.fase === 'enviando' ? 'Enviando…' : 'Avisadme por correo'}
        </button>
        <EnlaceMedido href={PORTAL_URL} origen={`ramo_ventana_${ramo}`} className="btn btn-outline" style={{ minHeight: 44 }}>
          O guárdala en mi área
        </EnlaceMedido>
      </div>
    </form>
  )
}
