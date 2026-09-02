import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// RETIRADA (02/09/2026). La previsión de la declaración vive en el segmento 🧾 Fiscal de `/banca`
// (`banca/FiscalResumen.tsx`), que fusionó `/finanzas/fiscal` + esta pantalla sobre el MISMO motor
// (`lib/comparativa-declaracion.ts::calcularEstadoDeclaracion`). El `CLAUDE.md` de la app la marcaba
// como «PENDIENTE de retirar» desde el 10/07/2026 y seguía en disco: ni en el menú, ni enlazada por
// nadie, ni alcanzable pulsando. Dos pantallas que calculan lo mismo son dos sitios donde arreglar
// el mismo fallo, y una que nadie puede abrir es la que se queda sin arreglar.
//
// Se conserva el redirect (no el cuerpo) para que un marcador viejo siga llevando a alguna parte.
export default async function ProyeccionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const { year } = await searchParams
  redirect(year ? `/banca?tab=fiscal&year=${year}` : '/banca?tab=fiscal')
}
