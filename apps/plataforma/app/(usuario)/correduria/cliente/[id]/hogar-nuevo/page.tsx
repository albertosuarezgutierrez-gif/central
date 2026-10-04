import Link from 'next/link'
import { Home } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { consultarHogar, normalizarReferencia } from '@/lib/correduria-hogar'
import { precalificarHogarNuevoAsegura } from '@/lib/hogar-nuevo-asegura'
import { direccionDeFicha } from '@/lib/hogar-direccion-ficha'
import { Pagina, PageHeader, cardStyle, CardHeader, btnStyle } from '@/components/ui'
import Formulario from './Formulario'
import { cargarVariante, FranjaVariante, ErrorVariante } from '../../../oportunidad/[id]/cargar-variante'
import { paramTexto, viviendaDeRiesgo } from '../../../oportunidad/[id]/variante'
import { inicialesHogarDeRiesgo } from '@central/module-seguros'

export const dynamic = 'force-dynamic'

/**
 * ⏱️ La cotización del vendor puede tardar hasta 150 s; la precalificación (gratis)
 * es más rápida pero comparte esta página. Mismo margen que
 * `.../poliza/[id]/retarificar/page.tsx`, por el mismo motivo — sin él plataforma
 * cortaría a los 15 s por defecto y nos quedaríamos sin saber si nos han cobrado.
 */
export const maxDuration = 180

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 14, minHeight: 44, background: 'var(--surface)', color: 'var(--text)',
}

function cadena(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : null
}

/**
 * **Presupuesto de hogar SIN póliza, DENTRO de `/correduria`.**
 *
 * Hasta el 07/09/2026 el botón «Presupuestar hogar (oportunidad nueva)» saltaba
 * a `apps/asegura` — otro dominio, otro diseño, otra sesión. Alberto: «todo tiene
 * que ser en el mismo desarrollo». Misma jugada que la retarificación de auto
 * (03/09/2026): la pantalla se pinta aquí, con el diseño de plataforma, y el dato
 * y el gasto siguen viviendo en asegura, servidos por el puerto de operador.
 *
 * Tres pasos, los tres en esta página: (1) resolver una referencia catastral —por
 * dirección o directamente— con `consultarHogar()` (gratis, servicio público del
 * Catastro, ya usado en `/correduria/hogar`); (2) precalificar la ficha con esa
 * referencia (gratis, vía asegura); (3) el formulario editable y el botón de pago,
 * en `<Formulario>`.
 */
export default async function HogarNuevoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id: clienteId } = await params
  const sp = await searchParams
  const direccion = cadena(sp.direccion)
  const municipio = cadena(sp.municipio) ?? 'SEVILLA'
  const provincia = cadena(sp.provincia) ?? 'SEVILLA'
  const referenciaParam = cadena(sp.referencia)

  // Variante de un riesgo (30/09/2026): `?oportunidad=` cuelga la tarificación de esa oportunidad (regla 9) y
  // precarga lo que el riesgo ya sabe de la vivienda (`info_riesgo.datosVivienda`). Se conserva en TODOS los
  // enlaces y formularios de esta pantalla: perderlo a mitad del buscador cotizaría sin enlazar (0,50€ tirados).
  const carga = await cargarVariante(paramTexto(sp.oportunidad), null, clienteId, 'hogar')
  const variante = carga.estado === 'ok' ? carga.variante : null
  const vivienda = carga.estado === 'ok' ? viviendaDeRiesgo(carga.riesgo) : null
  const oportunidad = variante?.oportunidadId ?? null
  const conOportunidad = (q: Record<string, string>) => new URLSearchParams(oportunidad ? { ...q, oportunidad } : q).toString()

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? <><Link href={`/correduria/cliente/${clienteId}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>{nombreCliente}</Link> · presupuesto de hogar (oportunidad nueva)</>
    : 'Presupuesto de hogar (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de hogar" icono={<Home size={20} strokeWidth={1.75} />} sub={sub} />
      {variante && <FranjaVariante variante={variante} />}
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

  // ── Paso 1: resolver una referencia catastral ────────────────────────────
  // Prioridad: lo que pide la URL > lo que el riesgo ya tiene anotado > la búsqueda por dirección.
  let referencia: string | null = referenciaParam
    ? normalizarReferencia(referenciaParam)
    : vivienda?.referenciaCatastral
      ? normalizarReferencia(vivienda.referenciaCatastral)
      : null

  if (direccion && referencia === null) {
    const r = await consultarHogar({ por: 'direccion', direccion, municipio, provincia })

    if (r.estado === 'elegir') {
      return (
        <Pagina>
          {cabecera}
          <div style={cardStyle}>
            <CardHeader title={`${r.inmuebles.length} inmuebles en ${r.via}: ¿cuál es?`} sub="El Catastro lista todos los pisos del portal. Con dos o más no se elige a ciegas." />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              {r.inmuebles.map((i) => (
                <Link
                  key={i.refCompleta}
                  href={`/correduria/cliente/${clienteId}/hogar-nuevo?${conOportunidad({ referencia: i.refCompleta })}`}
                  style={{ ...btnStyle('secundario'), textDecoration: 'none' }}
                >
                  Pl. {i.planta ?? '?'} · Pta. {i.puerta ?? '?'}
                </Link>
              ))}
            </div>
          </div>
          <FormularioBuscar clienteId={clienteId} direccion={direccion} municipio={municipio} provincia={provincia} oportunidad={oportunidad} />
        </Pagina>
      )
    }

    if (r.estado === 'ok') {
      referencia = r.referencia
    } else {
      const parecidas = (r.estado === 'ambigua' || r.estado === 'no_encontrado') ? r.parecidas ?? [] : []
      const mensaje =
        parecidas.length > 0
          ? 'El Catastro no tiene esa calle escrita así. ¿Es alguna de estas? (el nombre oficial a veces cambia o abrevia el nombre de pila; el código postal no hace falta)'
          : r.estado === 'ambigua'
          ? 'El callejero tiene varias calles parecidas en ese municipio: escribe el nombre completo de la vía, o usa la referencia catastral (recibo del IBI).'
          : r.estado === 'no_encontrado'
          ? 'Se ha consultado y el Catastro no devuelve ningún inmueble con esos datos.'
          : r.estado === 'direccion_ilegible'
          ? 'No se ha sabido leer la dirección: hace falta tipo de vía, nombre y número («Calle San Vicente 40»).'
          : `No se ha podido consultar el Catastro (${r.motivo}). No significa que la vivienda no exista: no se ha podido mirar.`
      return (
        <Pagina>
          {cabecera}
          <div style={{ ...cardStyle, borderColor: parecidas.length ? 'var(--warning)' : 'var(--negative)', color: parecidas.length ? 'var(--text)' : 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
            {mensaje}
            {parecidas.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {parecidas.map((c) => (
                  <Link
                    key={c.direccion}
                    href={`/correduria/cliente/${clienteId}/hogar-nuevo?${conOportunidad({ direccion: c.direccion, municipio, provincia })}`}
                    style={{ ...btnStyle('secundario'), textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}
                  >
                    {c.etiqueta}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <FormularioBuscar clienteId={clienteId} direccion={direccion} municipio={municipio} provincia={provincia} oportunidad={oportunidad} />
        </Pagina>
      )
    }
  }

  // ── Sin dirección ni referencia todavía: el buscador ─────────────────────
  // Sin nada que buscar aún, se parte de la dirección de su ficha (la de auto suele estar): se
  // PROPONE y se avisa de que puede no ser la vivienda. Consultar el Catastro sigue siendo un clic.
  if (referencia === null) {
    const deFicha = ficha.estado === 'ok' ? direccionDeFicha(ficha.ficha.contacto) : null
    return (
      <Pagina>
        {cabecera}
        {deFicha && (
          <p style={{ ...cardStyle, fontSize: 13, marginBottom: 14 }}>
            📍 Dirección de su ficha. Confírmala al hablar con él: ¿vive ahí? ¿es propietario o inquilino (entonces es contenido)?
          </p>
        )}
        <FormularioBuscar
          clienteId={clienteId}
          oportunidad={oportunidad}
          // Sin referencia catastral pero con la dirección del riesgo, se parte de ella (mejor que la de la ficha).
          direccion={vivienda?.direccion ?? deFicha?.direccion ?? ''}
          // Con dirección de la ficha pero sin municipio, el campo sale VACÍO: el «SEVILLA» por defecto
          // se leería como dato del cliente junto a su calle.
          municipio={vivienda?.municipio ?? (deFicha ? (deFicha.municipio ?? '') : municipio)}
          provincia={deFicha ? (deFicha.provincia ?? '') : provincia}
        />
      </Pagina>
    )
  }

  // ── Paso 2: precalificar la ficha (gratis) con la referencia resuelta ────
  // Con `?oportunidad=`, lo que el riesgo ya sabe de la vivienda entra como lo declarado (catálogos → `resueltos`,
  // el resto → `correcciones`); sin ella, o sin datos, la precalificación es la de siempre.
  const iniciales = inicialesHogarDeRiesgo(vivienda)
  const hayIniciales = Object.keys(iniciales.resueltos).length + Object.keys(iniciales.correcciones).length > 0
  const pre = await precalificarHogarNuevoAsegura({
    clienteId,
    referencia,
    ...(hayIniciales ? { resueltos: iniciales.resueltos, correcciones: iniciales.correcciones } : {}),
  })

  if (pre.estado !== 'ok') {
    const tono = pre.estado === 'sin_configurar' ? 'var(--muted)' : 'var(--negative)'
    return (
      <Pagina>
        {cabecera}
        <div style={{ ...cardStyle, borderColor: tono, color: tono, fontSize: 13, marginBottom: 14 }}>
          {pre.estado === 'no_encontrado'
            ? `No se ha podido precalificar: ${pre.mensaje}`
            : pre.estado === 'sin_configurar'
            ? `No se ha podido precalificar: ${pre.mensaje}`
            : `No se ha podido precalificar la ficha de hogar: ${pre.mensaje}`}
        </div>
        <FormularioBuscar clienteId={clienteId} direccion="" municipio={municipio} provincia={provincia} oportunidad={oportunidad} />
      </Pagina>
    )
  }

  // ── Paso 3: la ficha editable y el botón de pago ─────────────────────────
  return (
    <Pagina>
      {cabecera}
      <Formulario clienteId={clienteId} referencia={referencia} preInicial={pre.pre} variante={variante} iniciales={hayIniciales ? iniciales : null} />
    </Pagina>
  )
}

/** El buscador de partida: por dirección o por referencia, en GET puro (sin JS). */
function FormularioBuscar({
  clienteId,
  direccion,
  municipio,
  provincia,
  oportunidad,
}: {
  clienteId: string
  direccion: string
  municipio: string
  provincia: string
  /** La oportunidad de la variante: viaja en los dos formularios (GET) para no perderla al buscar. */
  oportunidad: string | null
}) {
  const accion = `/correduria/cliente/${clienteId}/hogar-nuevo`
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={cardStyle}>
        <CardHeader title="Por dirección" sub="El Catastro da m², año de construcción, uso y CP — gratis y sin preguntar al cliente." />
        <form method="get" action={accion} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {oportunidad && <input type="hidden" name="oportunidad" value={oportunidad} />}
          <input style={{ ...input, gridColumn: '1 / -1' }} name="direccion" placeholder="Calle San Vicente 40, 2º 14" defaultValue={direccion} autoFocus />
          <input style={input} name="municipio" placeholder="Municipio" defaultValue={municipio} />
          <input style={input} name="provincia" placeholder="Provincia" defaultValue={provincia} />
          <button type="submit" style={{ ...btnStyle('primario'), gridColumn: '1 / -1' }}>Consultar Catastro</button>
        </form>
      </div>
      <div style={cardStyle}>
        <CardHeader title="Por referencia catastral" sub="Los 20 caracteres del recibo del IBI (la de 14 es la del edificio: no trae m² ni año)." />
        <form method="get" action={accion} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {oportunidad && <input type="hidden" name="oportunidad" value={oportunidad} />}
          <input style={{ ...input, gridColumn: '1 / -1' }} name="referencia" placeholder="Referencia catastral de 20 caracteres" />
          <button type="submit" style={{ ...btnStyle('primario'), gridColumn: '1 / -1' }}>Consultar Catastro</button>
        </form>
      </div>
    </div>
  )
}
