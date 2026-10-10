'use client'

// «Pedir precio» de una oportunidad de AUTO, SIN salir de la página (10/10/2026; hermano de `PedirPrecioMoto.tsx`).
// Al abrir el bloque se lee en el servidor el riesgo y los catálogos (gratis, una vez por apertura) y se monta
// `AutoNuevo` EMBEBIDO: coche y figuras del riesgo; aquí solo las condiciones de la cotización. La carga, la huella
// del riesgo y el bloqueo (nunca 0,50€ con el riesgo anterior) son los comunes de `PedirPrecioEmbebido.tsx`.
// La pantalla completa `auto-nuevo` (con o sin `?oportunidad=`) sigue existiendo y monta el mismo componente.

import { cardStyle } from '@/components/ui'
import AutoNuevo from '../../cliente/[id]/auto-nuevo/AutoNuevo'
import { abrirCotizadorAutoDeOportunidad, type AperturaCotizadorAuto } from '../../cliente/[id]/auto-nuevo/acciones'
import PedirPrecioEmbebido, { type MontajeEmbebido, type PropsPedirPrecioEmbebido } from './PedirPrecioEmbebido'

type AperturaOk = Extract<AperturaCotizadorAuto, { estado: 'ok' }>

export default function PedirPrecioAuto(props: PropsPedirPrecioEmbebido) {
  return (
    <PedirPrecioEmbebido<AperturaOk>
      props={props}
      abrir={abrirCotizadorAutoDeOportunidad}
      cabecera="Coche e intervinientes: los de arriba. Aquí solo las condiciones de esta cotización."
      sinRiesgo="no se sabría qué coche ni quién conduce"
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
  // La matrícula es la del riesgo (la que pinta «Datos del vehículo»); sin ella, la de la oportunidad, como la pantalla completa.
  const matricula = (riesgo.datosVehiculo?.matricula ?? riesgo.oportunidad.matricula ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
  return (
    <>
      {datos.falloCatalogo &&
        aviso('No se han podido leer los catálogos de garajes o estados civiles de Codeoscopic. Sin ellos no hay ids válidos que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.', 'var(--negative)')}
      <AutoNuevo
        // Cada lectura del riesgo monta un cotizador NUEVO: nada de lo tecleado con el riesgo anterior sobrevive.
        key={n}
        embebido
        bloqueo={bloqueo}
        onCotizando={onCotizando}
        onCotizado={onCotizado}
        clienteId={clienteId}
        matriculaInicial={matricula}
        etiquetaCliente={pre.pre.etiquetaCliente}
        seguroImputado={pre.pre.seguroAnterior}
        faltanInicial={pre.pre.faltan}
        garajes={datos.garajes}
        civiles={datos.civiles}
        zonasCarnet={datos.zonasCarnet}
        tiposCarnet={datos.tiposCarnet}
        municipios={pre.pre.municipios}
        municipiosMotivo={pre.pre.municipiosMotivo}
        estadoCivilAuto={pre.pre.estadoCivil}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
        companias={datos.companias}
        variante={variante}
        datosRiesgo={riesgo.datosVehiculo}
        anterior={datos.anterior}
        anteriorAmbiguo={datos.anteriorAmbiguo}
        otroVehiculo={datos.otroVehiculo}
        carteraAllianz={datos.carteraAllianz}
      />
    </>
  )
}
