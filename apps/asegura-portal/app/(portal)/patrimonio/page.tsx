import Link from 'next/link'
import { redirect } from 'next/navigation'

import { patrimonioDeIdentidad } from '@/lib/patrimonio/inmuebles-bd'
import { avisosPolizasSinInmueble, type AvisoPintable } from '@/lib/patrimonio/poliza-sin-inmueble-bd'
import { precargaDeParametros, type ParametrosAlta } from '@/lib/patrimonio/precarga-alta'
import { getIdentidad } from '@/lib/session'

import { AvisoPolizaSinInmueble } from './AvisoPolizaSinInmueble'
import { ListaInmuebles } from './ListaInmuebles'
import { NuevoInmueble } from './NuevoInmueble'

export const dynamic = 'force-dynamic'

/**
 * «Patrimonio» (Fase 1, 22/10/2026): los inmuebles por titular. 🚨 Todo parte de `accesosPatrimonio()` (dentro de
 * `patrimonioDeIdentidad`): se ven SOLO los titulares a los que esta sesión tiene acceso. Sin ninguno, la página no
 * dice que exista nada (la entrada del menú tampoco aparece).
 */
export default async function PatrimonioPage({ searchParams }: { searchParams: Promise<ParametrosAlta> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const titulares = await patrimonioDeIdentidad(identidad.id)
  const precarga = precargaDeParametros(await searchParams)
  // Pólizas de hogar/comunidad sin inmueble (con el estado de sus peticiones, por el puente). Fallo = «no hemos podido
  // comprobarlo», nunca «no tienes ninguna».
  let sueltas: AvisoPintable[] | null = []
  if (titulares.length > 0) {
    try {
      sueltas = await avisosPolizasSinInmueble(identidad.id, { conPeticiones: true })
    } catch (e) {
      console.error('[portal/patrimonio] pólizas sin inmueble sin comprobar:', e instanceof Error ? e.message : e)
      sueltas = null
    }
  }

  return (
    <>
      <h1>Patrimonio</h1>
      <p className="suave" style={{ marginTop: 0 }}>Tus inmuebles y los de quien te ha dado acceso, por titular.</p>
      {titulares.length > 0 && (
        <p style={{ margin: '0 0 12px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link className="boton-tenue" style={{ minHeight: 44 }} href="/patrimonio/gastos">Gastos fijos, comunidad y derramas</Link>
          <Link className="boton-tenue" style={{ minHeight: 44 }} href="/patrimonio/calendario">Calendario y avisos</Link>
          <Link className="boton-tenue" style={{ minHeight: 44 }} href="/patrimonio/rentabilidad">Rentabilidad</Link>
        </p>
      )}

      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        <>
          <NuevoInmueble titulares={titulares.filter((t) => t.puedeAlta).map((t) => ({ clienteId: t.clienteId, nombre: t.nombre }))} precarga={precarga} />
          {sueltas === null ? (
            <p className="suave">No hemos podido comprobar ahora si tienes pólizas de hogar sin inmueble en tu patrimonio.</p>
          ) : (
            sueltas.length > 0 && (
              <section aria-labelledby="sueltas" style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
                <h2 id="sueltas" style={{ margin: 0 }}>Pólizas sin inmueble</h2>
                {sueltas.map((a) => (
                  <AvisoPolizaSinInmueble
                    key={`${a.tipo}:${a.id}`}
                    aviso={{ tipo: a.tipo, id: a.id, ubicacion: a.ubicacion, referenciaCatastral: a.referenciaCatastral, propuesta: a.propuesta, peticion: a.peticion, titularClienteId: a.titularClienteId }}
                  />
                ))}
              </section>
            )
          )}
          {titulares.map((t) => (
            <section key={t.clienteId} className="seccion" aria-labelledby={`titular-${t.clienteId}`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 id={`titular-${t.clienteId}`} style={{ margin: 0, overflowWrap: 'anywhere' }}>{t.nombre}</h2>
                <span className="chip">{t.propio ? 'Tuyo' : t.nivel === 'total' ? 'Acceso total' : 'Acceso de gestión'}</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <ListaInmuebles
                  inmuebles={t.inmuebles.map((i) => ({
                    id: i.id,
                    alias: i.alias,
                    uso: i.uso,
                    direccion: i.direccion,
                    calleSinValidar: i.calleSinValidar,
                    superficie: i.superficieM2 === null ? null : i.superficieM2.toLocaleString('es-ES'),
                  }))}
                />
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}
