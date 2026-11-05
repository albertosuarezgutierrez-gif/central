import { Cabecera } from '../_cabecera'
import { MarcarLeidos } from './MarcarLeidos'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'
import { limiteDe, PASO, MAXIMO } from '@/lib/paginas'
import { ordenarAvisosPorRelevancia } from '@central/module-contabilidad'

export const dynamic = 'force-dynamic'

export default async function Avisos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx, empresa, variasEmpresas, avisos: sinLeer } = await datosPagina()
  const limite = limiteDe((await searchParams).n)
  // Si 0002 aún no está aplicada la tabla no existe: la pantalla lo dice en vez de romper.
  const cruda = await conRepo(ctx.empresaId, (r) => r.avisos({ limite: limite + 1 })).catch(() => null)
  // El CNAE (0003) prioriza los tipos de aviso de la actividad (sin descartar ninguno); sin CNAE manda la plantilla.
  const cnae = await conRepo(ctx.empresaId, (r) => r.cnaeEmpresa()).catch(() => null)
  const lista = cruda === null ? null : ordenarAvisosPorRelevancia(cruda, empresa?.sector ?? 'generico', cnae)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={sinLeer} />
      <main className="contenido">
        <h1>Avisos</h1>
        <p className="tenue">Vencimientos fiscales (10, 5 y 1 días antes), caídas de ventas o margen, saldo de caja previsto negativo y movimientos que no se pudieron asentar. Solo se muestran aquí: no se envía nada a nadie.</p>
        {lista === null && <p className="aviso-error">Los avisos aún no están disponibles para esta empresa.</p>}
        {lista !== null && lista.length === 0 && <p className="tenue">Sin avisos por ahora.</p>}
        {lista !== null && lista.length > 0 && (
          <>
            {sinLeer > 0 && <MarcarLeidos />}
            <ul className="lista-avisos">
              {lista.slice(0, limite).map((a) => (
                <li key={a.id} className={`${a.severidad}${a.leido ? ' leido' : ''}`}>
                  <strong>{a.titulo}</strong>
                  <span>{a.detalle}</span>
                  {a.enlace && <a href={a.enlace}>Ir a la pantalla</a>}
                </li>
              ))}
            </ul>
            {lista.length > limite && limite < MAXIMO && <p className="ver-mas"><a className="btn btn-sec" href={`/avisos?n=${limite + PASO}`}>Ver más</a></p>}
          </>
        )}
      </main>
    </>
  )
}
