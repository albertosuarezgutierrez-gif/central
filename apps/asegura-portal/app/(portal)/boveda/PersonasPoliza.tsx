// Las personas de CIMA de una póliza en la ficha del cliente (asegura PR 880). Llega YA filtrado por la
// lista blanca (`lib/personas-poliza.ts`): sus figuras completas, de las demás papel y nombre, y de
// los terceros de sus siniestros solo papel, nombre, matrícula y compañía del contrario.
// `null` = no consta y no se pinta. Responsive: `.ficha-datos` se apila por debajo de 420 px.
import { textoBeneficiario, textoDomicilio } from '@central/module-seguros'
import type { FiguraAjenaCliente, FiguraPropiaCliente, TerceroCliente } from '@central/module-seguros-portal'
import type { SiniestroPortal } from '@/lib/cartera-lectura'
import { fechaEs } from '@/lib/fechas'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (valor === null || valor === '') return null
  return (
    <>
      <dt>{etiqueta}</dt>
      <dd>{valor}</dd>
    </>
  )
}

function fecha(iso: string | null): string | null {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? fechaEs(new Date(`${iso.slice(0, 10)}T00:00:00Z`)) : null
}

export function PersonasDeTuPoliza({ propias, otras }: { propias: FiguraPropiaCliente[] | null; otras: FiguraAjenaCliente[] }) {
  const hayPropias = propias !== null && propias.length > 0
  if (!hayPropias && otras.length === 0) return null
  return (
    <section className="seccion" aria-labelledby="personas-titulo">
      <h2 id="personas-titulo">Tus datos en esta póliza</h2>
      {hayPropias && (
        <>
          <p className="suave" style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.5 }}>
            Así te tiene la compañía en esta póliza. Si algo no es correcto, díselo a tu correduría.
          </p>
          <ul className="cartera">
            {propias!.map((f, i) => (
              <li key={i} className="cartera-card">
                <h3 style={{ overflowWrap: 'anywhere' }}>{f.etiqueta}</h3>
                <dl className="ficha-datos">
                  <Dato etiqueta="Nombre" valor={f.nombre} />
                  <Dato etiqueta="Domicilio" valor={textoDomicilio(f.domicilio)} />
                  <Dato etiqueta="Teléfono" valor={f.telefono} />
                  <Dato etiqueta="Correo" valor={f.email} />
                  <Dato etiqueta="Fecha de nacimiento" valor={fecha(f.fechaNacimiento)} />
                  <Dato etiqueta="Documento" valor={f.documentoConsta ? 'consta' : null} />
                  <Dato etiqueta="Beneficiario" valor={textoBeneficiario(f)} />
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
      {otras.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>Otras personas de la póliza</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {otras.map((f, i) => (
              <li key={i} style={{ overflowWrap: 'anywhere', fontSize: 14 }}>
                <span className="suave">{f.etiqueta}:</span> {f.nombre}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function TercerosDeTusSiniestros({
  siniestros,
  terceros,
}: {
  siniestros: SiniestroPortal[]
  terceros: Map<string, TerceroCliente[]>
}) {
  // Solo los siniestros de la cartera ya autorizada: un id que no esté aquí no se pinta.
  const filas = siniestros.flatMap((s) => {
    const l = terceros.get(s.id)
    return l && l.length > 0 ? [{ s, l }] : []
  })
  if (filas.length === 0) return null
  return (
    <section className="seccion" aria-labelledby="terceros-titulo">
      <h2 id="terceros-titulo">Otras partes de tus siniestros</h2>
      <ul className="cartera">
        {filas.map(({ s, l }) => {
          const cuando = fechaEs(s.fechaHora)
          return (
            <li key={s.id} className="cartera-card">
              <h3>{cuando ? `Siniestro del ${cuando}` : 'Siniestro'}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {l.map((t, i) => (
                  <li key={i} style={{ overflowWrap: 'anywhere', fontSize: 14, lineHeight: 1.5 }}>
                    <span className="suave">{t.etiqueta}:</span> {t.nombre ?? 'sin nombre'}
                    {(t.matricula || t.compania) && (
                      <span style={{ display: 'block' }} className="suave">
                        {[t.matricula && `Matrícula ${t.matricula}`, t.compania && `Compañía ${t.compania}`].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
