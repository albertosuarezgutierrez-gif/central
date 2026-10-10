import Link from 'next/link'
import { Car } from 'lucide-react'
import { Pagina, PageHeader, cardStyle } from '@/components/ui'
import AutoNuevo from './AutoNuevo'
import { datosCotizadorAuto } from './datos-cotizador'
import { cargarVariante, FranjaVariante, ErrorVariante } from '../../../oportunidad/[id]/cargar-variante'
import { paramTexto } from '../../../oportunidad/[id]/variante'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar hasta 150 s; mismo margen que el
 * resto de pantallas de pago de la correduría (retarificar, hogar-nuevo).
 */
export const maxDuration = 180

/**
 * **Presupuesto de auto SIN póliza, DENTRO de `/correduria`.**
 *
 * Hermana de `.../hogar-nuevo`, construida el mismo día por el mismo motivo:
 * Alberto no quiere saltar de pantalla para presupuestar una oportunidad
 * nueva. A diferencia de hogar (donde el Catastro da el riesgo gratis), aquí
 * no hay un servicio público equivalente: el vehículo se identifica con el
 * catálogo de Codeoscopic (marca→modelo→motor→versión, gratis) y la matrícula
 * la teclea el corredor — el mismo catálogo que ya usa la retarificación de
 * una póliza existente, reutilizado por el puerto de operador.
 *
 * Se cotiza DE CALLE (`aseguradoAntes: false`, ver `precalificarAutoNueva()`
 * en asegura): sin póliza que retarificar no hay compañía anterior que
 * declarar, así que no lleva el bonus por antigüedad de una retarificación.
 */
export default async function AutoNuevoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id: clienteId } = await params
  // `?matricula=` la trae el asistente de Telegram, leída de la póliza: no se teclea otra vez.
  const sp = await searchParams
  const mq = sp.matricula
  // Variante de un riesgo (29/09/2026): `?oportunidad=` cuelga la tarificación de esa oportunidad
  // y trae sus figuras (propietario, conductores) desde sus fichas.
  const carga = await cargarVariante(paramTexto(sp.oportunidad), paramTexto(sp.tarificacion), clienteId, 'auto')
  const matriculaRiesgo = carga.estado === 'ok' ? carga.riesgo.oportunidad.matricula : null
  const matriculaInicial = (typeof mq === 'string' ? mq : matriculaRiesgo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)

  // Lo mismo que lee el bloque «Pedir precio» de la oportunidad (`datos-cotizador.ts`): una sola lectura para las dos.
  const datos = await datosCotizadorAuto(clienteId, carga.estado === 'ok' ? carga.variante.oportunidadId : null)
  const nombreCliente = datos.nombreCliente
  const sub = nombreCliente
    ? <><Link href={`/correduria/cliente/${clienteId}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{nombreCliente}</Link> · presupuesto de auto (oportunidad nueva)</>
    : 'Presupuesto de auto (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de auto" icono={<Car size={20} strokeWidth={1.75} />} sub={sub} />
      {carga.estado === 'ok' && <FranjaVariante variante={carga.variante} />}
    </div>
  )

  if (carga.estado === 'error') {
    return (
      <Pagina>
        {cabecera}
        <ErrorVariante oportunidadId={carga.oportunidadId} mensaje={carga.mensaje} />
      </Pagina>
    )
  }
  const variante = carga.estado === 'ok' ? carga.variante : null

  const pre = datos.pre

  if (pre.estado !== 'ok') {
    const tono = pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)'
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13 }}>
          No se ha podido precalificar: {pre.mensaje}
        </div>
      </Pagina>
    )
  }

  return (
    <Pagina>
      {cabecera}
      {/* 🚨 Sin garajes ni estados civiles NO hay ids válidos que mandar, así que no se puede cotizar: se dice, en vez de
          dejar los desplegables vacíos y sin explicación (no es un problema de la ficha del cliente). */}
      {datos.falloCatalogo && (
        <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
          No se han podido leer los catálogos de garajes o estados civiles de Codeoscopic. Sin ellos no hay ids
          válidos que mandar, así que no se puede cotizar todavía. Esto no es un problema de la ficha del cliente.
        </div>
      )}
      <AutoNuevo
        clienteId={clienteId}
        matriculaInicial={matriculaInicial}
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
        datosRiesgo={carga.estado === 'ok' ? carga.riesgo.datosVehiculo : null}
        anterior={datos.anterior}
        anteriorAmbiguo={datos.anteriorAmbiguo}
        otroVehiculo={datos.otroVehiculo}
        carteraAllianz={datos.carteraAllianz}
        fichaTomador={datos.fichaTomador}
      />
    </Pagina>
  )
}
