// Información precontractual del mediador (art. 19 de la Ley 16/2018 de
// Distribución de Seguros, RDL 3/2020).
//
// Es OBLIGATORIA y tiene que estar disponible ANTES de que el cliente entregue
// ningún dato, así que esta página no depende de nada que pueda fallar: sin
// sesión, sin base de datos y sin cliente. Todo el contenido sale de
// `@central/module-seguros`, la fuente única que comparten el panel del
// corredor y el portal del asegurado — dos redacciones distintas del mismo
// registro DGSFP es la forma silenciosa de que una de las dos acabe siendo
// falsa.
//
// 🚨 El ORDEN de `PUNTOS_PRECONTRACTUALES` y de `CANALES_RECLAMACION` se
// respeta tal y como viene del módulo. En los canales importa de verdad:
// primero el Servicio de Atención al Cliente del mediador y solo después la
// DGSFP. Enseñarlos al revés invita al cliente a empezar por el supervisor, que
// es justo lo que la norma quiere evitar.
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  MEDIADOR,
  CANALES_RECLAMACION,
  PUNTOS_PRECONTRACTUALES,
  FECHA_TEXTOS_LEGALES,
  VERSION_TEXTOS_LEGALES,
} from '@central/module-seguros'

import { url } from '@/lib/sitio'

export const metadata: Metadata = {
  title: 'Información del mediador · Grupo ASegura',
  description:
    'Información precontractual del mediador exigida por el artículo 19 de la Ley 16/2018 de Distribución de Seguros: identidad, registro DGSFP, independencia, remuneración y reclamaciones.',
  alternates: { canonical: url('/legal/informacion-mediador') },
  robots: { index: true, follow: true },
}

const main: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--text)',
  padding: '32px 16px 64px',
}

const contenedor: CSSProperties = {
  maxWidth: 760,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const antetitulo: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--brand)',
}

const h1: CSSProperties = {
  fontSize: 'clamp(26px, 6vw, 36px)',
  lineHeight: 1.15,
  margin: '10px 0 0',
  fontWeight: 800,
  overflowWrap: 'break-word',
}

const entradilla: CSSProperties = {
  fontSize: 'clamp(16px, 3.5vw, 18px)',
  lineHeight: 1.6,
  color: 'var(--muted)',
  margin: '12px 0 0',
}

const tarjeta: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: 'clamp(16px, 4vw, 24px)',
}

const h2: CSSProperties = {
  fontSize: 'clamp(19px, 4vw, 22px)',
  lineHeight: 1.25,
  margin: '0 0 12px',
  fontWeight: 700,
}

const parrafo: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.65,
  margin: 0,
  overflowWrap: 'break-word',
}

const datos: CSSProperties = {
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 4,
}

const dt: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginTop: 12,
}

const dd: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.55,
  overflowWrap: 'anywhere',
}

const canales: CSSProperties = {
  margin: 0,
  paddingLeft: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const canalItem: CSSProperties = {
  fontSize: 16,
  lineHeight: 1.55,
}

const canalDetalle: CSSProperties = {
  display: 'block',
  fontSize: 15,
  lineHeight: 1.55,
  color: 'var(--muted)',
  margin: '4px 0 4px',
}

const enlace: CSSProperties = { color: 'var(--brand)', overflowWrap: 'anywhere' }

const version: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  margin: 0,
}

export default function InformacionMediador() {
  const { identidad, responsabilidadCivil, remuneracion, marca } = MEDIADOR

  return (
    <main style={main}>
      <div style={contenedor}>
        <header>
          <p style={antetitulo}>Información precontractual · Art. 19 Ley 16/2018</p>
          <h1 style={h1}>Información del mediador</h1>
          <p style={entradilla}>
            {marca} es el nombre comercial bajo el que ejerce {identidad.nombre}. Esta página recoge
            la información que la Ley de Distribución de Seguros obliga a facilitarte{' '}
            <em>antes</em> de que contrates nada.
          </p>
        </header>

        <section style={tarjeta} aria-labelledby="identificacion">
          <h2 id="identificacion" style={h2}>
            Identificación
          </h2>
          <dl style={datos}>
            <dt style={{ ...dt, marginTop: 0 }}>Mediador</dt>
            <dd style={dd}>{identidad.nombre}</dd>
            <dt style={dt}>Figura</dt>
            <dd style={dd}>{identidad.figura}</dd>
            <dt style={dt}>NIF</dt>
            <dd style={dd}>{identidad.nif}</dd>
            <dt style={dt}>Registro</dt>
            <dd style={dd}>
              Inscrito en el Registro Administrativo de Distribuidores de Seguros y Reaseguros de la
              Dirección General de Seguros y Fondos de Pensiones (DGSFP) con la clave{' '}
              <strong>{identidad.claveDgsfp}</strong>. Puedes comprobarlo en{' '}
              <a href="https://www.dgsfp.mineco.gob.es" rel="noreferrer noopener" style={enlace} target="_blank">
                dgsfp.mineco.gob.es
              </a>
              .
            </dd>
            <dt style={dt}>Domicilio profesional</dt>
            <dd style={dd}>{identidad.domicilio}</dd>
            <dt style={dt}>Contacto</dt>
            <dd style={dd}>
              <a href={`mailto:${identidad.email}`} style={enlace}>
                {identidad.email}
              </a>
            </dd>
          </dl>
        </section>

        {/* El punto `identidad` ya está desplegado arriba en forma de ficha; el
            resto se pinta en el orden en que viene del módulo. */}
        {PUNTOS_PRECONTRACTUALES.filter((punto) => punto.id !== 'identidad').map((punto) => (
          <section key={punto.id} style={tarjeta} aria-labelledby={`punto-${punto.id}`}>
            <h2 id={`punto-${punto.id}`} style={h2}>
              {punto.titulo}
            </h2>
            <p style={parrafo}>{punto.cuerpo}</p>
          </section>
        ))}

        <section style={tarjeta} aria-labelledby="rc-profesional">
          <h2 id="rc-profesional" style={h2}>
            Responsabilidad civil profesional
          </h2>
          <p style={parrafo}>
            El mediador tiene concertado un seguro de responsabilidad civil profesional con{' '}
            <strong>{responsabilidadCivil.aseguradora}</strong>, póliza{' '}
            <strong>{responsabilidadCivil.poliza}</strong>, conforme al{' '}
            {responsabilidadCivil.referenciaLegal}. Dispone también de la capacidad financiera
            exigida por la misma norma.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="asesoramiento">
          <h2 id="asesoramiento" style={h2}>
            Asesoramiento
          </h2>
          <p style={parrafo}>
            Como corredor, el asesoramiento se presta sobre la base de un análisis objetivo: se
            comparan contratos de distintas entidades aseguradoras suficientes para poder formular
            una recomendación motivada. La remuneración por ello es la descrita arriba (
            {remuneracion.naturaleza.toLowerCase()}) y no varía en función de qué compañía se elija.
          </p>
        </section>

        <section style={tarjeta} aria-labelledby="reclamaciones">
          <h2 id="reclamaciones" style={h2}>
            Quejas y reclamaciones
          </h2>
          <ol style={canales}>
            {CANALES_RECLAMACION.map((canal) => (
              <li key={canal.id} style={canalItem}>
                <strong>{canal.etiqueta}</strong>
                <span style={canalDetalle}>{canal.detalle}</span>
                <a href={canal.href} rel="noreferrer noopener" style={enlace}>
                  {canal.contacto}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section style={tarjeta} aria-labelledby="mas-legal">
          <h2 id="mas-legal" style={h2}>
            El resto de la letra pequeña
          </h2>
          <p style={parrafo}>
            <Link href="/legal/aviso-legal" style={enlace}>
              Aviso legal
            </Link>{' '}
            ·{' '}
            <Link href="/legal/privacidad" style={enlace}>
              Política de privacidad
            </Link>
          </p>
        </section>

        <p style={version}>
          Versión {VERSION_TEXTOS_LEGALES} · última revisión {FECHA_TEXTOS_LEGALES}
        </p>
      </div>
    </main>
  )
}
