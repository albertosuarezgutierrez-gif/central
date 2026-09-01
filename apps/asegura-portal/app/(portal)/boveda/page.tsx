import { redirect } from 'next/navigation'

import { etiquetaProcedencia } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { eur } from '@/lib/dinero'
import { getIdentidad } from '@/lib/session'

import { SubirPoliza } from './SubirPoliza'

export const dynamic = 'force-dynamic'

export default async function Boveda() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  // El filtro por `identidadId` NO es opcional: la sesión es lo único que
  // decide de quién es esta bóveda.
  const polizas = await prisma.portalPolizaDeclarada.findMany({
    where: { identidadId: identidad.id },
    orderBy: { creadaEn: 'desc' },
    take: 50,
  })

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginTop: 0 }}>Mis seguros</h1>

      {polizas.length === 0 ? (
        // «Todavía no has añadido ninguna» — no «no tienes seguros»: de la
        // cartera de la correduría aquí todavía no se lee nada.
        <p style={{ color: '#4b5563' }}>Todavía no has añadido ninguna póliza.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {polizas.map((p) => (
            <li
              key={p.id}
              style={{
                border: '1px solid var(--borde)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
              }}
            >
              <strong>{p.compania ?? 'Compañía sin identificar'}</strong>
              {p.ramo && <span> · {p.ramo}</span>}
              <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>
                {p.fechaVencimiento
                  ? `Vence el ${p.fechaVencimiento.toLocaleDateString('es-ES')}`
                  : 'No sabemos cuándo vence'}
                {' · '}
                {/* `Decimal` de Prisma: se convierte a número ANTES de formatear.
                    `null` sale como «—», jamás como «0,00€». */}
                {p.primaAnual == null ? 'Prima —' : `Prima ${eur(Number(p.primaAnual))}`}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {etiquetaProcedencia(p.procedencia)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SubirPoliza />
    </main>
  )
}
