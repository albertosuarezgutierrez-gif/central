import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { MEDIADOR, telefonoLegible } from '@central/module-seguros'
import { url } from '@/lib/sitio'
import { fichaFaq, migas, jsonLd } from '@/lib/seo'
import type { Ramo } from '@/lib/ramos'
import { hrefTel, telefonosParaPublicar, whatsappLegible } from '@/lib/telefonos-companias'

// Por qué existe (medido el 23/09/2026, `docs/ASEGURA-SEO-REDES-IDEAS.md` §P):
// «mapfre seguro hogar teléfono» son ~1.300 búsquedas al mes con dificultad
// casi nula, y las de las demás compañías van por el mismo camino. Quien la
// escribe tiene el siniestro encima: es intención de problema en estado puro.
//
// 🚨 Lo delicado aquí es el DATO, no el tono: ningún número de una compañía se
// pinta si no está verificado por una persona (`lib/telefonos-companias.ts`,
// con su cepo). De la no verificada se dice que no lo hemos comprobado y se
// enlaza su página oficial — nunca se deja fuera de la lista ni se pinta un
// número «probable». Y un horario desconocido NO se escribe como «24 h».
//
// No compite con la web de cada compañía por ser su teléfono: aporta lo que
// ella no dice — qué hacer además de llamar y los plazos de la ley.

export const metadata: Metadata = {
  title: 'Teléfonos para dar parte a tu aseguradora',
  description:
    'Los teléfonos de siniestros de las aseguradoras, comprobados en su web oficial y con fecha. Y qué hacer además de llamar: plazos de la ley y qué guardar.',
  alternates: { canonical: url('/telefonos-siniestros') },
  openGraph: {
    title: 'Teléfonos para dar parte a tu aseguradora',
    url: url('/telefonos-siniestros'),
    type: 'article',
  },
}

const panel: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radio)',
  padding: '16px 18px',
}

// Un número se marca con una mano en el arcén: el enlace ocupa los 44 px
// táctiles y no lleva el azul de enlace, porque aquí el dato ES el número.
const telefono: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--text)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

function fechaLegible(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

const FAQ = {
  faq: [
    {
      pregunta: '¿Qué número uso si mi compañía no está en la lista?',
      respuesta:
        'El que figura en las condiciones particulares de tu póliza o en la tarjeta que te dio la compañía: es el que corresponde a tu contrato. Si no lo encuentras, pídenoslo y te decimos cuál es.',
    },
    {
      pregunta: '¿Tengo un plazo para dar el parte?',
      respuesta:
        'Siete días desde que conoces el siniestro, salvo que tu póliza te dé más (art. 16 de la Ley de Contrato de Seguro). Llamar dentro de ese plazo y quedarte con el número de expediente es lo que después te protege.',
    },
    {
      pregunta: '¿Da igual llamar a la compañía o a mi corredor?',
      respuesta:
        'Si el plazo aprieta, llama a la compañía sin esperar: lo que cuenta es que ella lo reciba a tiempo. Si tienes el seguro con nosotros, avísanos también con el número de expediente y seguimos el caso desde ahí.',
    },
  ],
} as Pick<Ramo, 'faq'>

export default function TelefonosSiniestros() {
  const companias = telefonosParaPublicar()
  const faq = fichaFaq(FAQ as Ramo)
  const breadcrumb = migas([
    { nombre: 'Inicio', ruta: '/' },
    { nombre: 'Siniestros', ruta: '/siniestro' },
    { nombre: 'Teléfonos de las aseguradoras', ruta: '/telefonos-siniestros' },
  ])

  return (
    <div className="wrap pagina">
      {breadcrumb && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />}
      {faq && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faq) }} />}

      <nav aria-label="Migas de pan" style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/">Inicio</Link> <span aria-hidden>›</span> <Link href="/siniestro">Siniestros</Link>{' '}
        <span aria-hidden>›</span> Teléfonos
      </nav>

      <h1>Teléfonos para dar parte a tu aseguradora</h1>
      <p style={{ fontSize: 17, color: 'var(--muted)', maxWidth: 640 }}>
        El número para dar un parte es de la compañía, no del corredor, y conviene tenerlo a mano antes de necesitarlo.
        Solo publicamos los que hemos <strong style={{ color: 'var(--text)' }}>comprobado en la web oficial</strong> de
        cada compañía, con la fecha en que lo hicimos. Si el tuyo no está, el bueno es el que figura en tu póliza.
      </p>

      <ul style={{ margin: '24px 0', padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
        {companias.map((x) => (
          <li key={x.c.slug} style={panel}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>{x.c.nombre}</h2>
            {x.publicable ? (
              <>
                {x.c.siniestros && (
                  <p style={{ margin: 0 }}>
                    <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                      Dar parte
                    </span>
                    <br />
                    <a href={hrefTel(x.c.siniestros)} style={telefono}>{x.c.siniestros}</a>
                  </p>
                )}
                {/* Una línea por tipo de riesgo, rotulada como la rotula la compañía:
                    con un solo «Asistencia» alguien marcaría la grúa por una fuga. */}
                {x.c.asistencia
                  .filter((a) => !(a.numeros.length === 1 && a.numeros[0] === x.c.siniestros))
                  .map((a) => (
                    <p key={a.para} style={{ margin: '4px 0 0' }}>
                      <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                        {a.para === 'Asistencia' ? 'Asistencia' : `Asistencia · ${a.para}`}
                        {a.horario ? ` · ${a.horario}` : ''}
                      </span>
                      <br />
                      {a.numeros.map((n, i) => (
                        <span key={n}>
                          {i > 0 && <span style={{ color: 'var(--muted)' }}> o </span>}
                          <a href={hrefTel(n)} style={telefono}>{n}</a>
                        </span>
                      ))}
                    </p>
                  ))}
                {/* WhatsApp sin `tel:`: un enlace de llamada sobre él marcaría la
                    línea de voz, que es otra promesa. */}
                {x.c.whatsapp && !x.c.whatsappNota && (
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>También por WhatsApp en ese mismo número.</p>
                )}
                {x.c.whatsapp && x.c.whatsappNota && (
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                    WhatsApp {whatsappLegible(x.c.whatsapp)}, {x.c.whatsappNota}.
                  </p>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--muted)' }}>
                  {x.c.siniestros && (x.c.horario ? `Horario: ${x.c.horario}. ` : 'Horario: no lo hemos podido comprobar. ')}
                  {!x.c.siniestros && 'Para dar parte, el número de tu póliza o pídenoslo. '}
                  Comprobado el {fechaLegible(x.c.verificadoEl!)} en{' '}
                  <a href={x.c.fuente} rel="noopener">su web oficial</a>.
                </p>
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--muted)' }}>
                Todavía no lo hemos comprobado en su web, así que no lo publicamos. Míralo en tu póliza, en{' '}
                <a href={x.c.fuente} rel="noopener">su página de contacto</a> o pídenoslo.
              </p>
            )}
          </li>
        ))}
      </ul>

      <section aria-labelledby="ademas" style={{ ...panel, marginBottom: 24 }}>
        <h2 id="ademas">Además de llamar</h2>
        <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 10 }}>
          <li>
            <strong>Apunta el número de expediente</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>y el nombre de quien te atiende. Es lo que te pedirán en cada llamada después.</span>
          </li>
          <li>
            <strong>Hazlo dentro de los siete días</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>desde que conoces el siniestro, salvo que tu póliza te dé más (art. 16 LCS).</span>
          </li>
          <li>
            <strong>Guarda fotos y facturas antes de tocar nada.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>Es lo que mirará el perito.</span>
          </li>
        </ol>
        <p style={{ margin: '12px 0 0' }}>
          El paso a paso completo, con los plazos que tiene la compañía para pagarte:{' '}
          <Link href="/siniestro">qué hacer si tienes un siniestro</Link>.
        </p>
      </section>

      <section aria-labelledby="corredor" style={{ marginBottom: 24 }}>
        <h2 id="corredor">Si tienes el seguro con nosotros</h2>
        <p style={{ maxWidth: 640, marginTop: 0 }}>
          Da el parte a la compañía y avísanos con el número de expediente: seguimos el caso para que no se quede
          parado. Te atiende {MEDIADOR.identidad.nombre} en el{' '}
          <a href={hrefTel(MEDIADOR.identidad.telefono)} style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>{telefonoLegible()}</a>.
        </p>
      </section>

      <section aria-labelledby="faq" style={{ marginBottom: 28 }}>
        <h2 id="faq">Preguntas frecuentes</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {FAQ.faq.map((f) => (
            <details key={f.pregunta} open style={{ ...panel, padding: '14px 16px' }}>
              <summary style={{ fontWeight: 700, cursor: 'pointer', minHeight: 28 }}>{f.pregunta}</summary>
              <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>{f.respuesta}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
