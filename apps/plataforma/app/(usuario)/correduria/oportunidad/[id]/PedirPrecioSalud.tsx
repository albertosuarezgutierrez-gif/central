'use client'

// «Pedir precio» de una oportunidad de SALUD, SIN salir de la página (13/10/2026, fase SALUD del riesgo unificado;
// gemela de `PedirPrecioDecesos.tsx`: misma petición `risk.insureds[]`, `apps/asegura/lib/codeoscopic/peticion-salud.ts`).
// Al abrir el bloque se lee en el servidor el riesgo, se precalifica la ficha del tomador y se lee el catálogo de
// estados civiles (gratis), y se monta `SaludNuevo` EMBEBIDO: tomador y asegurados son los de «Intervinientes» (los
// asegurados viajan desde sus FICHAS, los arma asegura); aquí solo las condiciones de esta cotización. La carga, la
// huella del riesgo y el bloqueo (nunca 0,50€ con el riesgo anterior) son los comunes de `PedirPrecioEmbebido.tsx`.
// La pantalla completa `salud-nuevo` (con o sin `?oportunidad=`) sigue existiendo y monta el mismo componente.

import { cardStyle } from '@/components/ui'
import SaludNuevo from '../../cliente/[id]/salud-nuevo/SaludNuevo'
import { abrirCotizadorSaludDeOportunidad, type AperturaCotizadorSalud } from '../../cliente/[id]/salud-nuevo/acciones'
import PedirPrecioEmbebido, { type MontajeEmbebido, type PropsPedirPrecioEmbebido } from './PedirPrecioEmbebido'

type AperturaOk = Extract<AperturaCotizadorSalud, { estado: 'ok' }>

export default function PedirPrecioSalud(props: PropsPedirPrecioEmbebido) {
  return (
    <PedirPrecioEmbebido<AperturaOk>
      props={props}
      abrir={abrirCotizadorSaludDeOportunidad}
      cabecera="Tomador y asegurados: los de arriba. Aquí solo las condiciones de esta cotización."
      sinRiesgo="no se sabría a quién se asegura"
      montar={(m) => <Montaje {...m} />}
    />
  )
}

function Montaje({ apertura, n, bloqueo, onCotizando, onCotizado }: MontajeEmbebido<AperturaOk>) {
  const { riesgo, variante, clienteId, pre, civiles } = apertura
  const aviso = (texto: string, tono: string) => (
    <div role="status" style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>{texto}</div>
  )
  if (pre.estado !== 'ok') return aviso(`No se ha podido precalificar: ${pre.mensaje}`, pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)')
  if (pre.pre.salud.estado === 'ausente') {
    return aviso(
      `Salud no está entre los ramos que Codeoscopic tiene habilitados para Grupo ASegura hoy${pre.pre.salud.ramos.length > 0 ? ` (los disponibles son: ${pre.pre.salud.ramos.join(', ')})` : ''}. Hay que pedírselo a Codeoscopic antes de poder cotizar salud.`,
      'var(--negative)',
    )
  }
  return (
    <>
      {pre.pre.salud.estado === 'desconocido' &&
        aviso('No se ha podido comprobar si salud tarifica para Grupo ASegura (fallo al leer los ramos de Codeoscopic). El servidor cortará antes de gastar si al final no se puede.', 'var(--muted)')}
      {civiles.estado !== 'ok' &&
        aviso('No se ha podido leer el catálogo de estados civiles de Codeoscopic. Sin él no hay id válido que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.', 'var(--negative)')}
      {aviso('El contrato de salud con Codeoscopic no está verificado: el primer intento real puede fallar pidiendo un campo que hoy no se manda. No reintentes varias veces seguidas: cada intento cuesta 0,50€.', 'var(--warning)')}
      <SaludNuevo
        // Cada lectura del riesgo monta un cotizador NUEVO: nada de lo tecleado con el riesgo anterior sobrevive.
        key={n}
        embebido
        riesgo={riesgo}
        bloqueo={bloqueo}
        onCotizando={onCotizando}
        onCotizado={onCotizado}
        clienteId={clienteId}
        variante={variante}
        etiquetaCliente={pre.pre.etiquetaCliente}
        faltanInicial={pre.pre.faltan}
        civiles={civiles.estado === 'ok' ? civiles.opciones : []}
        estadoCivil={pre.pre.estadoCivil}
        estadoCivilMotivo={pre.pre.estadoCivilMotivo}
        consumo={pre.pre.consumo}
        simulacion={pre.pre.simulacion}
      />
    </>
  )
}
