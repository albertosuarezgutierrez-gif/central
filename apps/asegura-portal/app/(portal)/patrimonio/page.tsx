import { redirect } from 'next/navigation'

import { patrimonioDeIdentidad } from '@/lib/patrimonio/inmuebles-bd'
import { getIdentidad } from '@/lib/session'

import { ListaInmuebles } from './ListaInmuebles'
import { NuevoInmueble } from './NuevoInmueble'

export const dynamic = 'force-dynamic'

/**
 * «Patrimonio» (Fase 1, 22/10/2026): los inmuebles por titular. 🚨 Todo parte de `accesosPatrimonio()` (dentro de
 * `patrimonioDeIdentidad`): se ven SOLO los titulares a los que esta sesión tiene acceso. Sin ninguno, la página no
 * dice que exista nada (la entrada del menú tampoco aparece).
 */
export default async function PatrimonioPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const titulares = await patrimonioDeIdentidad(identidad.id)

  return (
    <>
      <h1>Patrimonio</h1>
      <p className="suave" style={{ marginTop: 0 }}>Tus inmuebles y los de quien te ha dado acceso, por titular.</p>

      {titulares.length === 0 ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : (
        <>
          <NuevoInmueble titulares={titulares.filter((t) => t.puedeAlta).map((t) => ({ clienteId: t.clienteId, nombre: t.nombre }))} />
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
