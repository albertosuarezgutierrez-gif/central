import type { Metadata } from 'next'

import {
  MEDIADOR,
  CANALES_RECLAMACION,
  PUNTOS_PRECONTRACTUALES,
  FECHA_TEXTOS_LEGALES,
  VERSION_TEXTOS_LEGALES,
} from '@central/module-seguros'

export const metadata: Metadata = {
  title: 'Información del mediador — Grupo Asegura',
  description:
    'Información precontractual del mediador de seguros exigida por el artículo 19 de la Ley 16/2018 de Distribución de Seguros.',
}

/**
 * Información precontractual del mediador (art. 19 Ley 16/2018 / RDL 3/2020).
 *
 * Es OBLIGATORIA y tiene que estar disponible antes de que el cliente entregue
 * ningún dato, así que esta página vive fuera de la sesión: sin cookie, sin
 * consulta a la base de datos y sin nada que pueda fallar. Todo el contenido
 * sale de `@central/module-seguros`, que es la fuente única compartida con el
 * panel del corredor — dos redacciones distintas del mismo registro DGSFP es la
 * forma silenciosa de que una de las dos acabe siendo falsa.
 */
export default function InfoMediador() {
  const { identidad, responsabilidadCivil, remuneracion, marca } = MEDIADOR

  return (
    <>
      <p className="legal-antetitulo">Información precontractual · Art. 19 Ley 16/2018</p>
      <h1>Información del mediador</h1>
      <p className="legal-entradilla">
        {marca} es el nombre comercial bajo el que ejerce {identidad.nombre}. Esta página recoge la
        información que la Ley de Distribución de Seguros obliga a facilitarte <em>antes</em> de que
        contrates nada.
      </p>

      <section>
        <h2>Identificación</h2>
        <dl className="legal-datos">
          <dt>Mediador</dt>
          <dd>{identidad.nombre}</dd>
          <dt>Figura</dt>
          <dd>{identidad.figura}</dd>
          <dt>NIF</dt>
          <dd>{identidad.nif}</dd>
          <dt>Registro</dt>
          <dd>
            Inscrito en el Registro Administrativo de Distribuidores de Seguros y Reaseguros de la
            Dirección General de Seguros y Fondos de Pensiones (DGSFP) con la clave{' '}
            <strong>{identidad.claveDgsfp}</strong>. Puedes comprobarlo en{' '}
            <a href="https://www.dgsfp.mineco.gob.es" rel="noreferrer noopener" target="_blank">
              dgsfp.mineco.gob.es
            </a>
            .
          </dd>
          <dt>Domicilio profesional</dt>
          <dd>{identidad.domicilio}</dd>
          <dt>Contacto</dt>
          <dd>
            <a href={`mailto:${identidad.email}`}>{identidad.email}</a>
          </dd>
        </dl>
      </section>

      {PUNTOS_PRECONTRACTUALES.filter((p) => p.id !== 'identidad').map((punto) => (
        <section key={punto.id}>
          <h2>{punto.titulo}</h2>
          <p>{punto.cuerpo}</p>
        </section>
      ))}

      <section>
        <h2>Responsabilidad civil profesional</h2>
        <p>
          El mediador tiene concertado un seguro de responsabilidad civil profesional con{' '}
          <strong>{responsabilidadCivil.aseguradora}</strong>, póliza{' '}
          <strong>{responsabilidadCivil.poliza}</strong>, conforme al {responsabilidadCivil.referenciaLegal}
          . También dispone de la capacidad financiera exigida por la misma norma.
        </p>
      </section>

      <section>
        <h2>Asesoramiento</h2>
        <p>
          Como corredor, el asesoramiento se presta sobre la base de un análisis objetivo:
          se comparan contratos de distintas entidades aseguradoras suficientes para poder formular
          una recomendación motivada. La remuneración por ello es la descrita arriba (
          {remuneracion.naturaleza.toLowerCase()}) y no varía en función de qué compañía se elija.
        </p>
      </section>

      <section>
        <h2>Quejas y reclamaciones</h2>
        <ol className="legal-canales">
          {CANALES_RECLAMACION.map((canal) => (
            <li key={canal.id}>
              <strong>{canal.etiqueta}</strong>
              <span className="legal-detalle">{canal.detalle}</span>
              <a href={canal.href} rel="noreferrer noopener">
                {canal.contacto}
              </a>
            </li>
          ))}
        </ol>
      </section>

      <p className="legal-version">
        Versión {VERSION_TEXTOS_LEGALES} · última revisión {FECHA_TEXTOS_LEGALES}
      </p>
    </>
  )
}
