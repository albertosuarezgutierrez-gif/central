'use client'

// La CARCASA común del cotizador embebido en el bloque «Pedir precio» del riesgo (10/10/2026; nació en
// `PedirPrecioMoto.tsx` el 07/10/2026 y se extrajo al llegar auto). La usan todos los ramos de
// `COTIZADOR_EMBEBIDO` (`cotizadores-embebidos.tsx`): cada ramo solo aporta CÓMO se abre (su acción de servidor,
// gratis) y QUÉ cotizador monta. Lo que vive aquí, y por eso es igual en todos:
//   - al abrir el bloque se lee en el servidor el riesgo y los catálogos (gratis, una vez por apertura);
//   - 🚨 datos viejos: el cotizador guarda en memoria el riesgo que se leyó al abrir. Si arriba se está editando, o el
//     riesgo de la pantalla cambia, se BLOQUEA (con el motivo a la vista) y se vuelve a leer; nunca se paga 0,50€ con
//     el riesgo anterior (`cotizador-embebido.ts`);
//   - cada lectura monta un cotizador NUEVO (`n`, que el ramo usa de `key`): nada de lo tecleado con el riesgo
//     anterior sobrevive.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import type { Riesgo } from '@/lib/riesgo-asegura'
import { firmaRiesgoVehiculo, motivoBloqueoCotizador } from './cotizador-embebido'

/** Lo que `RiesgoPantalla` le da a CUALQUIER cotizador embebido (el contrato del registro `COTIZADOR_EMBEBIDO`). */
export type PropsPedirPrecioEmbebido = {
  riesgo: Riesgo
  editandoVehiculo: boolean
  editandoFiguras: boolean
  recargando: boolean
  onCotizando: (enVuelo: boolean) => void
  /** La cotización quedó guardada y enlazada a la oportunidad (regla 9): el padre relee y la abre en el historial. */
  onCotizado: (tarificacionId: string) => void
  /** Lo guardado no coincide con lo de la pantalla: el padre relee el riesgo. */
  onDesfase: () => void
  onCerrar: () => void
}

/** Lo que la acción de servidor de un ramo devuelve al abrir el bloque. */
export type AperturaEmbebida = { estado: 'error'; mensaje: string } | { estado: 'ok'; riesgo: Riesgo }

/** Lo que el ramo recibe para montar su cotizador. */
export type MontajeEmbebido<A> = {
  apertura: A
  /** Nº de lectura: úsalo de `key` del cotizador (una instancia nueva por lectura del riesgo). */
  n: number
  bloqueo: string | null
  onCotizando: (enVuelo: boolean) => void
  onCotizado: (tarificacionId: string) => void
}

type Carga<A> =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  /** `firmaBase` = la huella del riesgo de la PANTALLA al pedir; `firmaServidor` = la del riesgo leído en el servidor. */
  | { estado: 'ok'; apertura: A; firmaBase: string; firmaServidor: string; n: number }

export default function PedirPrecioEmbebido<A extends { estado: 'ok'; riesgo: Riesgo }>({ props, abrir, cabecera, sinRiesgo, montar }: {
  props: PropsPedirPrecioEmbebido
  /** La acción de servidor del ramo (gratis): relee el riesgo y lo que su cotizador necesita. */
  abrir: (entrada: { oportunidadId: string }) => Promise<{ estado: 'error'; mensaje: string } | A>
  /** «Moto e intervinientes: los de arriba…» */
  cabecera: string
  /** Qué se perdería sin el riesgo («no se sabría qué moto ni quién conduce»). */
  sinRiesgo: string
  montar: (m: MontajeEmbebido<A>) => ReactNode
}) {
  const { riesgo, editandoVehiculo, editandoFiguras, recargando, onCotizando, onCotizado, onDesfase, onCerrar } = props
  const oportunidadId = riesgo.oportunidad.id
  const firmaActual = firmaRiesgoVehiculo(riesgo)
  const [carga, setCarga] = useState<Carga<A>>({ estado: 'cargando' })
  const [cotizando, setCotizando] = useState(false)
  const peticion = useRef(0)
  const montajes = useRef(0)

  async function cargar() {
    const pet = ++peticion.current
    const firmaBase = firmaRiesgoVehiculo(riesgo)
    setCarga({ estado: 'cargando' })
    try {
      const r = await abrir({ oportunidadId })
      if (pet !== peticion.current) return
      if (r.estado !== 'ok') { setCarga({ estado: 'error', mensaje: (r as { mensaje: string }).mensaje }); return }
      const ok = r as A
      const firmaServidor = firmaRiesgoVehiculo(ok.riesgo)
      setCarga({ estado: 'ok', apertura: ok, firmaBase, firmaServidor, n: ++montajes.current })
      // La pantalla pinta un riesgo que ya no es el guardado: que se relea (y entonces se vuelve a abrir solo).
      if (firmaServidor !== firmaBase) onDesfase()
    } catch {
      if (pet === peticion.current) setCarga({ estado: 'error', mensaje: 'No se ha podido leer el riesgo ahora (sin conexión).' })
    }
  }

  // Al abrir el bloque, una vez.
  useEffect(() => {
    void cargar()
    return () => { peticion.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadId])

  const riesgoCambiado = carga.estado === 'ok' && carga.firmaBase !== firmaActual
  const pantallaDesfasada = carga.estado === 'ok' && carga.firmaServidor !== carga.firmaBase
  // El riesgo de la pantalla cambió (se guardó arriba, se cambió una persona…): se relee y el cotizador se monta
  // de nuevo, sin nada de lo anterior. Nunca a mitad de una cotización ni con algo a medio editar.
  useEffect(() => {
    if (riesgoCambiado && !cotizando && !editandoVehiculo && !editandoFiguras && !recargando) void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riesgoCambiado, cotizando, editandoVehiculo, editandoFiguras, recargando])

  const bloqueo = motivoBloqueoCotizador({ editandoVehiculo, editandoFiguras, recargando, riesgoCambiado, pantallaDesfasada })

  function alCotizar(enVuelo: boolean) {
    setCotizando(enVuelo)
    onCotizando(enVuelo)
  }

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>{cabecera}</span>
        <button type="button" onClick={onCerrar} disabled={cotizando} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}>
          Cerrar
        </button>
      </div>
      {carga.estado === 'cargando' && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo el riesgo y los catálogos (gratis)…</p>
      )}
      {carga.estado === 'error' && (
        <div role="status" style={{ ...cardStyle, borderLeft: '3px solid var(--negative)', fontSize: 13, display: 'grid', gap: 8 }}>
          <span style={{ color: 'var(--negative)' }}>{carga.mensaje} Sin el riesgo no se pide precio ({sinRiesgo}).</span>
          <div>
            <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Volver a leer</button>
          </div>
        </div>
      )}
      {carga.estado === 'ok' && montar({ apertura: carga.apertura, n: carga.n, bloqueo, onCotizando: alCotizar, onCotizado })}
    </div>
  )
}
