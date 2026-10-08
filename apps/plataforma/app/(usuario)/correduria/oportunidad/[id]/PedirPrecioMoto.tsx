'use client'

// «Pedir precio» de una oportunidad de MOTO, SIN salir de la página (07/10/2026, Fase 1 «la oportunidad es la única
// página», OK de Alberto). Al abrir el bloque se lee en el servidor el riesgo y los catálogos (gratis, una vez por
// apertura, no en cada visita) y se monta el `CotizadorMoto` EMBEBIDO: vehículo y figuras del riesgo; aquí solo las
// condiciones de la cotización.
//
// 🚨 Datos viejos: el cotizador guarda en memoria el riesgo que se leyó al abrir. Si arriba se está editando, o el
// riesgo de la pantalla cambia, se BLOQUEA (con el motivo a la vista) y se vuelve a leer; nunca se paga 0,50€ con el
// riesgo anterior (`cotizador-embebido.ts`).

import { useEffect, useRef, useState } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import type { Riesgo } from '@/lib/riesgo-asegura'
import CotizadorMoto from '../../cliente/[id]/moto-nuevo/CotizadorMoto'
import { abrirCotizadorMotoDeOportunidad, type AperturaCotizadorMoto } from '../../cliente/[id]/moto-nuevo/acciones'
import { firmaRiesgoMoto, motivoBloqueoCotizador } from './cotizador-embebido'

type Carga =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  /** `firmaBase` = la huella del riesgo de la PANTALLA al pedir; `firmaServidor` = la del riesgo leído en el servidor. */
  | { estado: 'ok'; apertura: Extract<AperturaCotizadorMoto, { estado: 'ok' }>; firmaBase: string; firmaServidor: string; n: number }

export default function PedirPrecioMoto({ riesgo, editandoVehiculo, editandoFiguras, recargando, onCotizando, onCotizado, onDesfase, onCerrar }: {
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
}) {
  const oportunidadId = riesgo.oportunidad.id
  const firmaActual = firmaRiesgoMoto(riesgo)
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [cotizando, setCotizando] = useState(false)
  const peticion = useRef(0)
  const montajes = useRef(0)

  async function cargar() {
    const pet = ++peticion.current
    const firmaBase = firmaRiesgoMoto(riesgo)
    setCarga({ estado: 'cargando' })
    try {
      const r = await abrirCotizadorMotoDeOportunidad({ oportunidadId })
      if (pet !== peticion.current) return
      if (r.estado !== 'ok') { setCarga({ estado: 'error', mensaje: r.mensaje }); return }
      const firmaServidor = firmaRiesgoMoto(r.riesgo)
      setCarga({ estado: 'ok', apertura: r, firmaBase, firmaServidor, n: ++montajes.current })
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
        <span style={{ fontSize: 13, color: 'var(--muted)', minWidth: 0 }}>
          Moto e intervinientes: los de arriba. Aquí solo las condiciones de esta cotización.
        </span>
        <button type="button" onClick={onCerrar} disabled={cotizando} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}>
          Cerrar
        </button>
      </div>
      {carga.estado === 'cargando' && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Leyendo el riesgo y los catálogos (gratis)…</p>
      )}
      {carga.estado === 'error' && (
        <div role="status" style={{ ...cardStyle, borderLeft: '3px solid var(--negative)', fontSize: 13, display: 'grid', gap: 8 }}>
          <span style={{ color: 'var(--negative)' }}>{carga.mensaje} Sin el riesgo no se pide precio (no se sabría qué moto ni quién conduce).</span>
          <div>
            <button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Volver a leer</button>
          </div>
        </div>
      )}
      {carga.estado === 'ok' && <Montaje carga={carga} bloqueo={bloqueo} onCotizando={alCotizar} onCotizado={onCotizado} />}
    </div>
  )
}

function Montaje({ carga, bloqueo, onCotizando, onCotizado }: {
  carga: Extract<Carga, { estado: 'ok' }>
  bloqueo: string | null
  onCotizando: (enVuelo: boolean) => void
  onCotizado: (tarificacionId: string) => void
}) {
  const { apertura } = carga
  const { datos, riesgo, variante, clienteId } = apertura
  const pre = datos.pre
  const aviso = (texto: string, tono: string) => (
    <div role="status" style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>{texto}</div>
  )
  if (pre.estado !== 'ok') return aviso(`No se ha podido precalificar: ${pre.mensaje}`, pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)')
  if (pre.pre.moto.estado === 'ausente') {
    return aviso(
      `Moto no está entre los ramos que Codeoscopic tiene habilitados para Grupo ASegura hoy${pre.pre.moto.ramos.length > 0 ? ` (los disponibles son: ${pre.pre.moto.ramos.join(', ')})` : ''}. Hay que pedírselo a Codeoscopic antes de poder cotizar moto.`,
      'var(--negative)',
    )
  }
  return (
    <>
      {pre.pre.moto.estado === 'desconocido' &&
        aviso('No se ha podido comprobar si moto tarifica para Grupo ASegura (fallo al leer los ramos de Codeoscopic). El servidor cortará antes de gastar si al final no se puede.', 'var(--muted)')}
      {datos.falloCatalogo &&
        aviso('No se han podido leer los catálogos de garajes o estados civiles de Codeoscopic. Sin ellos no hay ids válidos que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.', 'var(--negative)')}
      <CotizadorMoto
        // Cada lectura del riesgo monta un cotizador NUEVO: nada de lo tecleado con el riesgo anterior sobrevive.
        key={carga.n}
        embebido
        bloqueo={bloqueo}
        onCotizando={onCotizando}
        onCotizado={onCotizado}
        clienteId={clienteId}
        etiquetaCliente={pre.pre.etiquetaCliente}
        seguroImputado={pre.pre.seguroAnterior}
        faltanInicial={pre.pre.faltan}
        garajes={datos.garajes}
        civiles={datos.civiles}
        municipios={pre.pre.municipios}
        municipiosMotivo={pre.pre.municipiosMotivo}
        estadoCivilMoto={pre.pre.estadoCivil}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
        companias={datos.companias}
        variante={variante}
        datosRiesgo={riesgo.datosVehiculo}
        anterior={datos.anterior}
        anteriorAmbiguo={datos.anteriorAmbiguo}
        otroVehiculo={datos.otroVehiculo}
      />
    </>
  )
}
