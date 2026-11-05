import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { INFORMES } from '@/lib/informes/catalogo'

export const dynamic = 'force-dynamic'

export default async function Informes() {
  const { empresa, variasEmpresas, avisos } = await datosPagina()
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Informes</h1>
        <p className="tenue">Informes estándar de tu contabilidad. Todos se pueden descargar en Excel y CSV, o imprimir/guardar en PDF.</p>
        <div className="rejilla">
          {INFORMES.map((i) => (
            <a key={i.clave} className="tarjeta" href={`/informes/${i.clave}`}>
              <span className="tarjeta-texto"><strong>{i.titulo}</strong><span className="desc">{i.descripcion}</span></span>
            </a>
          ))}
        </div>
      </main>
    </>
  )
}
