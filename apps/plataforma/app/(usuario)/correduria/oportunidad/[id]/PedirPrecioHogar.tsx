'use client'

// «Pedir precio» de una oportunidad de HOGAR, SIN salir de la página (10/10/2026, fase HOGAR del riesgo unificado;
// hermano de `PedirPrecioMoto.tsx`/`PedirPrecioAuto.tsx`). Al abrir el bloque se lee en el servidor el riesgo y se
// precalifica la ficha de hogar con la vivienda del riesgo (gratis: Catastro + catálogos) y se monta el `Formulario`
// de `hogar-nuevo` EMBEBIDO, en modo «solo condiciones»: vivienda y personas son las de arriba. La carga, la huella del
// riesgo y el bloqueo (nunca 0,50€ con el riesgo anterior) son los comunes de `PedirPrecioEmbebido.tsx`.
// La pantalla completa `hogar-nuevo` (con o sin `?oportunidad=`) sigue existiendo y monta el mismo componente.

import { cardStyle } from '@/components/ui'
import Formulario from '../../cliente/[id]/hogar-nuevo/Formulario'
import { abrirCotizadorHogarDeOportunidad, type AperturaCotizadorHogar } from '../../cliente/[id]/hogar-nuevo/acciones'
import { figurasFrenteAPeticionHogar } from './cotizador-hogar'
import { viviendaDeRiesgo } from './variante'
import PedirPrecioEmbebido, { type MontajeEmbebido, type PropsPedirPrecioEmbebido } from './PedirPrecioEmbebido'

type AperturaOk = Extract<AperturaCotizadorHogar, { estado: 'ok' }>

export default function PedirPrecioHogar(props: PropsPedirPrecioEmbebido) {
  return (
    <PedirPrecioEmbebido<AperturaOk>
      props={props}
      abrir={abrirCotizadorHogarDeOportunidad}
      cabecera="Vivienda e intervinientes: los de arriba. Aquí solo las condiciones de esta cotización."
      sinRiesgo="no se sabría qué vivienda ni quién es el tomador"
      montar={(m) => <Montaje {...m} />}
    />
  )
}

function Montaje({ apertura, n, bloqueo, onCotizando, onCotizado }: MontajeEmbebido<AperturaOk>) {
  const { riesgo, variante, clienteId, referencia, iniciales, pre } = apertura
  const aviso = (texto: string, tono: string) => (
    <div role="status" style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>{texto}</div>
  )
  if (referencia === null || pre === null) {
    return aviso('Falta la referencia catastral de la vivienda: sin ella no se puede leer la ficha de hogar. Complétala arriba, en «Datos de la vivienda» (con «Rellenar desde el Catastro» se busca por la calle y el número, gratis).', 'var(--warning)')
  }
  if (pre.estado !== 'ok') {
    return aviso(
      pre.estado === 'no_encontrado' ? `No se ha podido precalificar: ${pre.mensaje}` : `No se ha podido precalificar la ficha de hogar: ${pre.mensaje}`,
      pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)',
    )
  }
  // Lo que las personas del riesgo dicen frente a lo que la petición de hogar puede llevar (propietario/asegurado).
  const fig = figurasFrenteAPeticionHogar({
    figuras: riesgo.figuras,
    tomadorId: clienteId,
    propietarioEsTomador: viviendaDeRiesgo(riesgo)?.propietarioEsTomador ?? null,
  })
  return (
    <>
      {fig.avisos.map((t) => <div key={t}>{aviso(t, 'var(--muted)')}</div>)}
      <Formulario
        // Cada lectura del riesgo monta un cotizador NUEVO: nada de lo tecleado con el riesgo anterior sobrevive.
        key={n}
        embebido
        // Lo que esté a medias arriba manda; después, una contradicción entre personas y vivienda.
        bloqueo={bloqueo ?? fig.bloqueo}
        onCotizando={onCotizando}
        onCotizado={onCotizado}
        clienteId={clienteId}
        referencia={referencia}
        preInicial={pre.pre}
        variante={variante}
        iniciales={iniciales}
      />
    </>
  )
}
