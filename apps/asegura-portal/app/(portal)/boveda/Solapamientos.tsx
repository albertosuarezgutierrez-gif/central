import Link from 'next/link'

import type { Solapamiento } from '@central/module-seguros-portal'

/**
 * «Esta cobertura está en dos de tus pólizas». Componente de servidor: solo
 * pinta lo que `detectarSolapamientos()` ya decidió.
 *
 * 🚨 Informa, no juzga. El texto dice QUÉ cobertura aparece en QUÉ pólizas
 * (con el nombre exacto que le da cada compañía) y remite a las condiciones.
 * No dice «te sobra», ni «pagas dos veces», ni cuánto: eso es asesoramiento
 * (RDL 3/2020) y además puede ser falso — la defensa jurídica del coche y la
 * de la casa defienden asuntos distintos.
 *
 * Y con cero solapamientos NO se pinta nada: una sección que dijera «no hemos
 * encontrado coberturas repetidas» afirmaría un «revisado, todo bien» que solo
 * vale para las coberturas informadas, no para las que la compañía no manda.
 */
export function Solapamientos({
  solapamientos,
  declaradas,
}: {
  solapamientos: readonly Solapamiento[]
  /**
   * Ids de las pólizas DECLARADAS (las que el cliente subió, de otra
   * compañía): su ficha vive en `/boveda/anadida/…`, no en `/boveda/poliza/…`.
   * Un enlace a la ruta equivocada no falla: da un 404 que parece «esta
   * póliza ya no está».
   */
  declaradas?: ReadonlySet<string>
}) {
  if (solapamientos.length === 0) return null
  const hrefDe = (id: string) => (declaradas?.has(id) ? `/boveda/anadida/${id}` : `/boveda/poliza/${id}`)
  return (
    <section className="seccion" aria-labelledby="solapamientos-titulo">
      <p className="antetitulo">Para que lo compruebes</p>
      <h2 id="solapamientos-titulo">Coberturas que aparecen en más de una póliza</h2>
      <p className="suave" style={{ marginTop: 0 }}>
        Lo hemos visto en las coberturas que informan tus compañías y en las que leímos de las pólizas que subiste. No
        siempre es un duplicado: cada póliza
        puede cubrir un asunto distinto con el mismo nombre. Merece mirar las condiciones de cada una.
      </p>
      <ul className="solapamientos">
        {solapamientos.map((s) => (
          <li key={s.familia} className="solapamiento">
            <strong>{s.etiqueta}</strong>
            <ul>
              {s.polizas.map((p) => (
                <li key={p.id}>
                  <Link href={hrefDe(p.id)}>{p.titulo}</Link>
                  <span className="tenue"> · «{p.cobertura}»</span>
                </li>
              ))}
            </ul>
            <p className="tenue" style={{ margin: '6px 0 0' }}>{s.matiz}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
