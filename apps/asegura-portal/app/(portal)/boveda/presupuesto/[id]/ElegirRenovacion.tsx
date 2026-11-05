'use client'
import { useState } from 'react'

import { eur } from '@/lib/dinero'
import { TEXTOS_RENOVACION, textoDiferenciaRenovacion, textoElegidaPorOtro, textoEleccionHecha, type EleccionVista } from '@/lib/renovacion-vista'
import { LogoCompania } from './LogoCompania'

/**
 * RENOVACIÓN CON ALTERNATIVAS (04/11/2026): «Quiero esta opción» / «Me quedo con mi renovación», SIN firma.
 *
 *  - Elegir NO contrata ni emite: avisa al corredor, que confirma con la compañía. Se dice en la pantalla.
 *  - Puede cambiar de opinión (cada cambio avisa); la misma elección dos veces no vuelve a avisar.
 *  - La vista previa del corredor y quien no puede elegir ven los botones APAGADOS y rotulados.
 *  - Un error NO se pinta como «elegido»: se dice que no se ha guardado.
 *  - (05/11/2026) Vale la PRIMERA elección: si la hizo OTRA persona (tomador ↔ autorizado), se dice «ya la ha elegido
 *    <nombre de pila>», no «Elegiste…», y los botones se apagan (el puente también lo niega: 409 `ya_elegida`).
 *  - Sin hex ni formatos a mano: clases y tokens del portal; importes con `eur()` (formato español).
 */
export type OpcionElegible = { id: string; compania: string; producto: string; primaEur: number | null; franquiciaEur: number | null }

export function ElegirRenovacion({ presupuestoId, opciones, primaRenovacion, companiaActual, eleccion, eleccionAt, puedeElegir, vistaPrevia, caducado, elegidaPorOtro }: {
  presupuestoId: string
  opciones: OpcionElegible[]
  primaRenovacion: number | null
  companiaActual: string | null
  eleccion: EleccionVista
  eleccionAt: Date | null
  puedeElegir: boolean
  vistaPrevia: boolean
  caducado: boolean
  /** La eligió OTRA persona (vale la primera). `null` = nadie, o fue quien mira. */
  elegidaPorOtro: { nombre: string | null } | null
}) {
  const [elegida, setElegida] = useState<EleccionVista>(eleccion)
  const [deOtro, setDeOtro] = useState<{ nombre: string | null } | null>(elegidaPorOtro)
  const [cuando, setCuando] = useState<Date | null>(eleccionAt)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const activo = puedeElegir && !vistaPrevia && deOtro === null

  async function elegir(e: { eleccion: 'renovacion' } | { eleccion: 'opcion'; opcionId: string }) {
    if (!activo) return
    const clave = e.eleccion === 'renovacion' ? 'renovacion' : e.opcionId
    setOcupado(clave)
    setAviso(null)
    try {
      const r = await fetch('/api/presupuesto/elegir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presupuestoId, ...e }) })
      const j = (await r.json().catch(() => null)) as { estado?: string; por?: unknown } | null
      if (r.status === 409 && j?.estado === 'ya_elegida') {
        setDeOtro({ nombre: typeof j.por === 'string' && j.por.trim() ? j.por.trim() : null })
      } else if (r.ok && j?.estado === 'ok') {
        setElegida(e.eleccion === 'renovacion' ? { tipo: 'renovacion' } : { tipo: 'opcion', opcionId: e.opcionId })
        setCuando(new Date())
      } else {
        setAviso(j?.estado === 'limite' ? TEXTOS_RENOVACION.limite : j?.estado === 'caducado' ? TEXTOS_RENOVACION.caducado : j?.estado === 'sin_permiso' ? TEXTOS_RENOVACION.sinPermiso : r.status === 503 ? TEXTOS_RENOVACION.noDisponible : TEXTOS_RENOVACION.error)
      }
    } catch {
      setAviso(TEXTOS_RENOVACION.error)
    } finally {
      setOcupado(null)
    }
  }

  const opcionElegida = elegida?.tipo === 'opcion' ? opciones.find((o) => o.id === elegida.opcionId) ?? null : null
  // Si la eligió otra persona, NUNCA «Elegiste…»: se dice quién (nombre de pila) y que vale la primera.
  const hecha = deOtro ? null : textoEleccionHecha(elegida, opcionElegida, cuando)
  const esLaElegida = (id: string) => elegida?.tipo === 'opcion' && elegida.opcionId === id
  const estiloBoton = { minHeight: 48, width: '100%' } as const
  const apagado = { ...estiloBoton, opacity: 0.55, cursor: 'not-allowed' } as const

  return (
    <section className="seccion" aria-labelledby="elegir-renovacion">
      <h2 id="elegir-renovacion" style={{ marginTop: 0 }}>¿Con cuál te quedas?</h2>
      <p className="suave" style={{ marginTop: 0 }}>{TEXTOS_RENOVACION.noContrata}</p>
      {vistaPrevia && <p className="pendiente" role="note">{TEXTOS_RENOVACION.vistaPrevia}</p>}
      {caducado && <p className="pendiente">{TEXTOS_RENOVACION.caducado}</p>}
      {hecha && <p className="confirmacion" role="status">{hecha}</p>}
      {deOtro && <p className="pendiente" role="status">{textoElegidaPorOtro(deOtro.nombre)}</p>}
      {aviso && <p className="pendiente" role="alert">{aviso}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        <article className="presu-tarjeta" data-elegida={elegida?.tipo === 'renovacion' ? 'si' : undefined}>
          <p className="presu-papel">{TEXTOS_RENOVACION.actual}</p>
          {companiaActual && <div className="presu-compania"><LogoCompania nombre={companiaActual} alto={30} /></div>}
          <p className="presu-importe">{primaRenovacion === null ? <span className="pendiente">prima no informada</span> : eur(primaRenovacion)}</p>
          <button
            type="button"
            className={elegida?.tipo === 'renovacion' ? 'boton' : 'boton-tenue'}
            style={activo ? estiloBoton : apagado}
            disabled={!activo || ocupado !== null}
            aria-pressed={elegida?.tipo === 'renovacion'}
            onClick={() => elegir({ eleccion: 'renovacion' })}
          >
            {ocupado === 'renovacion' ? 'Guardando…' : TEXTOS_RENOVACION.quedarme}
          </button>
        </article>

        {opciones.filter((o) => o.primaEur !== null).map((o) => {
          const dif = textoDiferenciaRenovacion(o.primaEur, primaRenovacion)
          return (
            <article key={o.id} className="presu-tarjeta" data-elegida={esLaElegida(o.id) ? 'si' : undefined}>
              <div className="presu-compania"><LogoCompania nombre={o.compania} alto={30} /></div>
              <p className="presu-producto">{o.producto}</p>
              <p className="presu-importe">{eur(o.primaEur)}</p>
              <p className="suave" style={{ margin: '0 0 8px' }}>
                {o.franquiciaEur === null ? 'Franquicia: la compañía no la declara' : `Franquicia: ${eur(o.franquiciaEur)}`}
                {dif ? ` · ${dif}` : ''}
              </p>
              <button
                type="button"
                className={esLaElegida(o.id) ? 'boton' : 'boton-tenue'}
                style={activo ? estiloBoton : apagado}
                disabled={!activo || ocupado !== null}
                aria-pressed={esLaElegida(o.id)}
                onClick={() => elegir({ eleccion: 'opcion', opcionId: o.id })}
              >
                {ocupado === o.id ? 'Guardando…' : TEXTOS_RENOVACION.quiero}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
