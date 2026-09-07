import Link from 'next/link'
import { Home } from 'lucide-react'
import { fichaAsegura } from '@/lib/ficha-asegura'
import { consultarHogar, normalizarReferencia } from '@/lib/correduria-hogar'
import { precalificarHogarNuevoAsegura } from '@/lib/hogar-nuevo-asegura'
import { Pagina, PageHeader, cardStyle, CardHeader, btnStyle } from '@/components/ui'
import Formulario from './Formulario'

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

  const ficha = await fichaAsegura(clienteId)
  const nombreCliente = ficha.estado === 'ok' ? ficha.ficha.nombre : null
  const sub = nombreCliente
    ? `${nombreCliente} · presupuesto de hogar (oportunidad nueva)`
    : 'Presupuesto de hogar (oportunidad nueva) · sin ninguna póliza en la cartera'

  const cabecera = (
    <div style={{ marginBottom: 14 }}>
      <Link href={`/correduria/cliente/${clienteId}`} style={{ fontSize: 13, color: 'var(--muted)' }}>
        ← Ficha del cliente
      </Link>
      <PageHeader titulo="Presupuesto de hogar" icono={<Home size={20} strokeWidth={1.75} />} sub={sub} />
    </div>
  )

  // ── Paso 1: resolver una referencia catastral ────────────────────────────
  let referencia: string | null = referenciaParam ? normalizarReferencia(referenciaParam) : null

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
                  href={`/correduria/cliente/${clienteId}/hogar-nuevo?referencia=${encodeURIComponent(i.refCompleta)}`}
                  style={{ ...btnStyle('secundario'), textDecoration: 'none' }}
                >
                  Pl. {i.planta ?? '?'} · Pta. {i.puerta ?? '?'}
                </Link>
              ))}
            </div>
          </div>
          <FormularioBuscar clienteId={clienteId} direccion={direccion} municipio={municipio} provincia={provincia} />
        </Pagina>
      )
    }

    if (r.estado === 'ok') {
      referencia = r.referencia
    } else {
      const mensaje =
        r.estado === 'ambigua'
          ? 'El callejero tiene varias calles parecidas en ese municipio: escribe el nombre completo de la vía, o usa la referencia catastral (recibo del IBI).'
          : r.estado === 'no_encontrado'
          ? 'Se ha consultado y el Catastro no devuelve ningún inmueble con esos datos.'
          : r.estado === 'direccion_ilegible'
          ? 'No se ha sabido leer la dirección: hace falta tipo de vía, nombre y número («Calle San Vicente 40»).'
          : `No se ha podido consultar el Catastro (${r.motivo}). No significa que la vivienda no exista: no se ha podido mirar.`
      return (
        <Pagina>
          {cabecera}
          <div style={{ ...cardStyle, borderColor: 'var(--negative)', color: 'var(--negative)', fontSize: 13, marginBottom: 14 }}>
            {mensaje}
          </div>
          <FormularioBuscar clienteId={clienteId} direccion={direccion} municipio={municipio} provincia={provincia} />
        </Pagina>
      )
    }
  }

  // ── Sin dirección ni referencia todavía: el buscador ─────────────────────
  if (referencia === null) {
    return (
      <Pagina>
        {cabecera}
        <FormularioBuscar clienteId={clienteId} direccion="" municipio={municipio} provincia={provincia} />
      </Pagina>
    )
  }

  // ── Paso 2: precalificar la ficha (gratis) con la referencia resuelta ────
  const pre = await precalificarHogarNuevoAsegura({ clienteId, referencia })

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
        <FormularioBuscar clienteId={clienteId} direccion="" municipio={municipio} provincia={provincia} />
      </Pagina>
    )
  }

  // ── Paso 3: la ficha editable y el botón de pago ─────────────────────────
  return (
    <Pagina>
      {cabecera}
      <Formulario clienteId={clienteId} referencia={referencia} preInicial={pre.pre} />
    </Pagina>
  )
}

/** El buscador de partida: por dirección o por referencia, en GET puro (sin JS). */
function FormularioBuscar({
  clienteId,
  direccion,
  municipio,
  provincia,
}: {
  clienteId: string
  direccion: string
  municipio: string
  provincia: string
}) {
  const accion = `/correduria/cliente/${clienteId}/hogar-nuevo`
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={cardStyle}>
        <CardHeader title="Por dirección" sub="El Catastro da m², año de construcción, uso y CP — gratis y sin preguntar al cliente." />
        <form method="get" action={accion} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <input style={{ ...input, gridColumn: '1 / -1' }} name="direccion" placeholder="Calle San Vicente 40, 2º 14" defaultValue={direccion} autoFocus />
          <input style={input} name="municipio" placeholder="Municipio" defaultValue={municipio} />
          <input style={input} name="provincia" placeholder="Provincia" defaultValue={provincia} />
          <button type="submit" style={{ ...btnStyle('primario'), gridColumn: '1 / -1' }}>Consultar Catastro</button>
        </form>
      </div>
      <div style={cardStyle}>
        <CardHeader title="Por referencia catastral" sub="Los 20 caracteres del recibo del IBI (la de 14 es la del edificio: no trae m² ni año)." />
        <form method="get" action={accion} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <input style={{ ...input, gridColumn: '1 / -1' }} name="referencia" placeholder="Referencia catastral de 20 caracteres" />
          <button type="submit" style={{ ...btnStyle('primario'), gridColumn: '1 / -1' }}>Consultar Catastro</button>
        </form>
      </div>
    </div>
  )
}
