'use client'

// «Pedir precio» de una oportunidad de MOTO, SIN salir de la página (07/10/2026, Fase 1 «la oportunidad es la única
// página», OK de Alberto). Al abrir el bloque se lee en el servidor el riesgo y los catálogos (gratis, una vez por
// apertura, no en cada visita) y se monta el `CotizadorMoto` EMBEBIDO: vehículo y figuras del riesgo; aquí solo las
// condiciones de la cotización.
//
// 🚨 Datos viejos: el cotizador guarda en memoria el riesgo que se leyó al abrir. Si arriba se está editando, o el
// riesgo de la pantalla cambia, se BLOQUEA (con el motivo a la vista) y se vuelve a leer; nunca se paga 0,50€ con el
// riesgo anterior (`cotizador-embebido.ts`). Esa parte es común a todos los ramos: `PedirPrecioEmbebido.tsx`.

import { cardStyle } from '@/components/ui'
import CotizadorMoto from '../../cliente/[id]/moto-nuevo/CotizadorMoto'
import { abrirCotizadorMotoDeOportunidad, type AperturaCotizadorMoto } from '../../cliente/[id]/moto-nuevo/acciones'
import PedirPrecioEmbebido, { type MontajeEmbebido, type PropsPedirPrecioEmbebido } from './PedirPrecioEmbebido'

type AperturaOk = Extract<AperturaCotizadorMoto, { estado: 'ok' }>

// La carga, la huella del riesgo y el bloqueo son los de TODOS los cotizadores embebidos (`PedirPrecioEmbebido`).
export default function PedirPrecioMoto(props: PropsPedirPrecioEmbebido) {
  return (
    <PedirPrecioEmbebido<AperturaOk>
      props={props}
      abrir={abrirCotizadorMotoDeOportunidad}
      cabecera="Moto e intervinientes: los de arriba. Aquí solo las condiciones de esta cotización."
      sinRiesgo="no se sabría qué moto ni quién conduce"
      montar={(m) => <Montaje {...m} />}
    />
  )
}

function Montaje({ apertura, n, bloqueo, onCotizando, onCotizado }: MontajeEmbebido<AperturaOk>) {
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
        key={n}
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
