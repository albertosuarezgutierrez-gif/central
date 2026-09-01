import ResultadoPisosClient from './ResultadoPisosClient'

export const dynamic = 'force-dynamic'

// Rendimiento de los pisos: P&L por rango de meses + previsión y seguimiento.
// El estado del intervalo/piso vive en la URL; el servidor solo lo lee y se lo pasa al cliente.
export default async function ResultadoPisosPage({ searchParams }: {
  searchParams: Promise<{ desde?: string; hasta?: string; piso?: string }>
}) {
  const sp = await searchParams
  return (
    <ResultadoPisosClient
      desdeInicial={sp.desde ?? null}
      hastaInicial={sp.hasta ?? null}
      pisoInicial={sp.piso ?? ''}
    />
  )
}
