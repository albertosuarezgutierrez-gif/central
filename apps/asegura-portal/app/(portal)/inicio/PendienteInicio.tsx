'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { Avisos } from '@/lib/avisos'
import type { FuentePendiente, ItemPendiente, PendienteInicio as Pendiente } from '@/lib/inicio-pendientes'

import { TarjetaPortal } from '../../TarjetaPortal'

/** Los avisos que Inicio NO repite: el vencimiento ya sale en «Vencimientos», y una felicitación no es una tarea. */
const TIPOS_FUERA = new Set<string>(['obligacion_en_ventana', 'felicitacion'])

const NOMBRE_FUENTE: Record<FuentePendiente, string> = {
  vencimientos: 'tus vencimientos',
  recibos: 'tus recibos',
  siniestros: 'tus siniestros',
}

/** Triángulo de aviso (trazo, hereda el color): sustituye al «⚠» de texto. Nunca va solo: el texto dice lo mismo. */
function IconoAviso({ peligro }: { peligro?: boolean }) {
  return (
    <svg className={peligro ? 'icono-aviso peligro' : 'icono-aviso'} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  )
}

/** Escudo con visto (el de «Seguros» de la barra inferior): el estado vacío amable. */
function IconoTodoAlDia() {
  return (
    <svg className="icono-grande" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function Lista({ items }: { items: ItemPendiente[] }) {
  return (
    <ul className="lista-pendiente">
      {items.map((i) => (
        <li key={i.clave}>
          <Link href={i.href}>
            <span className="lista-pendiente-titulo">
              {i.urgente && <IconoAviso peligro />}
              {i.titulo}
            </span>
            {i.detalle && <span className="lista-pendiente-detalle">{i.detalle}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Lo pendiente de «Inicio»: vencimientos, recibos, avisos, siniestros abiertos y la sugerencia de huecos. Cliente porque
 * los AVISOS salen de `/api/avisos` (la fuente de la campana: una sola lista, no una segunda que se separe). El resto
 * llega ya calculado del servidor.
 *
 * Sin nada pendiente y todo leído: estado vacío amable con un acceso a Seguros. Mientras los avisos cargan NO se
 * enseña el vacío (diría «todo al día» sobre algo que no se ha mirado); si no se pueden leer, se dice.
 */
export function PendienteInicio({ pendiente, huecos }: { pendiente: Pendiente; huecos: ReactNode }) {
  const [avisos, setAvisos] = useState<Avisos | 'error' | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/avisos', { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      setAvisos((await r.json()) as Avisos)
    } catch {
      setAvisos('error')
    }
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const avisosVisibles = avisos !== null && avisos !== 'error' ? avisos.avisos.filter((a) => !TIPOS_FUERA.has(a.tipo)) : []
  const avisosIlegibles = avisos === 'error' || (avisos !== null && avisos.fuentesIlegibles.length > 0)
  const cargando = avisos === null
  const hayAlgo =
    pendiente.vencimientos.length + pendiente.recibos.length + pendiente.siniestros.length + avisosVisibles.length > 0 || huecos !== null
  const sinComprobar = pendiente.sinComprobar

  return (
    <>
      {sinComprobar.length > 0 && (
        <p className="aviso-linea" role="status">
          <IconoAviso />
          No hemos podido comprobar {sinComprobar.map((f) => NOMBRE_FUENTE[f]).join(', ')}. Puede haber algo pendiente que no
          vemos ahora mismo.{' '}
          <a href="/inicio">Volver a intentarlo</a>
        </p>
      )}
      {avisosIlegibles && (
        <p className="aviso-linea" role="status">
          <IconoAviso />
          No hemos podido leer tus avisos. Puede haber más.{' '}
          <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => void cargar()}>
            Volver a intentarlo
          </button>
        </p>
      )}

      <ul className="rejilla-portal">
        {pendiente.recibos.length > 0 && (
          <li>
            <TarjetaPortal
              id="inicio-recibos"
              antetitulo="Pagos"
              titulo="Recibos"
              tono={pendiente.recibos.some((r) => r.urgente) ? 'peligro' : undefined}
              accion={<Link className="boton secundario" href="/boveda?vista=recibos">Ver mis recibos</Link>}
            >
              <Lista items={pendiente.recibos} />
            </TarjetaPortal>
          </li>
        )}
        {pendiente.siniestros.length > 0 && (
          <li>
            <TarjetaPortal
              id="inicio-siniestros"
              antetitulo="En tramitación"
              titulo="Siniestros abiertos"
              tono="aviso"
              accion={<Link className="boton secundario" href="/boveda?vista=siniestro">Ver mis siniestros</Link>}
            >
              <Lista items={pendiente.siniestros} />
            </TarjetaPortal>
          </li>
        )}
        {pendiente.vencimientos.length > 0 && (
          <li>
            <TarjetaPortal id="inicio-vencimientos" antetitulo="Próximos 60 días" titulo="Vencimientos">
              <Lista items={pendiente.vencimientos} />
            </TarjetaPortal>
          </li>
        )}
        {avisosVisibles.length > 0 && (
          <li>
            <TarjetaPortal id="inicio-avisos" antetitulo="Para ti" titulo="Avisos">
              <ul className="lista-pendiente">
                {avisosVisibles.map((a) => (
                  <li key={a.id}>
                    {/* `<a>` y no `<Link>`: el destino puede llevar `#` a un titular de la misma página (como la campana). */}
                    <a href={a.href}>
                      <span className="lista-pendiente-titulo">{a.titulo}</span>
                      <span className="lista-pendiente-detalle">{a.detalle}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </TarjetaPortal>
          </li>
        )}
      </ul>

      {/* Máximo UNA sugerencia comercial por pantalla (y ya SOLO está aquí): Inicio no es un escaparate. */}
      {huecos}

      {cargando && !hayAlgo && sinComprobar.length === 0 && (
        <p className="suave" role="status">Mirando qué tienes pendiente…</p>
      )}

      {!cargando && !hayAlgo && sinComprobar.length === 0 && !avisosIlegibles && (
        <div className="vacio-amable">
          <TarjetaPortal
            id="inicio-vacio"
            accion={<Link className="boton" href="/boveda">Ver mis seguros</Link>}
          >
            <IconoTodoAlDia />
            <h2 style={{ marginBottom: 8 }}>Todo al día</h2>
            <p className="suave" style={{ marginTop: 0 }}>
              Ahora mismo no hay nada que atender: ni vencimientos próximos, ni recibos, ni siniestros, ni avisos. Cuando haya
              algo, lo verás aquí.
            </p>
          </TarjetaPortal>
        </div>
      )}
    </>
  )
}
