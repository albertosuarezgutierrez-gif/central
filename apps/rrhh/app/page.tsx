import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import Wordmark from '@/components/Wordmark'
import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import { ENTRADA_ASEGURA, estiloMarcaEmpresa, marcaDePeticion, metadataMarcaAsegura, themeColorMarca } from '@/lib/marca-asegura'

type SP = Promise<{ m?: string | string[] }>
async function marca(searchParams: SP) {
  const [h, { m }] = await Promise.all([headers(), searchParams])
  return marcaDePeticion(h.get('x-forwarded-host') ?? h.get('host'), m)
}
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  return metadataMarcaAsegura(await marca(searchParams))
}
export async function generateViewport({ searchParams }: { searchParams: SP }): Promise<Viewport> {
  const t = themeColorMarca(await marca(searchParams))
  return t ? { themeColor: t } : {}
}

const BOTON = 'flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-white no-underline hover:bg-accent-ink'

export default async function Home({ searchParams }: { searchParams: SP }) {
  if (await marca(searchParams)) {
    return (
      <main className="marca-asegura flex min-h-screen flex-col items-center p-4" style={estiloMarcaEmpresa(true, null) as React.CSSProperties}>
        <div className="my-auto w-full max-w-sm rounded-[18px] border border-line bg-card p-6 text-center sm:p-7">
          <CoMarca alto={30} />
          <h1 className="mt-4 text-xl">Portal del Empleado</h1>
          <div className="mt-5 grid gap-3">
            <a href={ENTRADA_ASEGURA} className={BOTON}>Soy empleado</a>
            <a href="/login" className={BOTON}>Soy responsable de la empresa</a>
          </div>
        </div>
        <div className="w-full"><PieAsegura /></div>
      </main>
    )
  }
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <Wordmark className="text-4xl" />
        <p className="text-ink-2 mt-3">Portal del Empleado — casa de marcas.</p>
        <a href="/e/entrar" className="mt-5 mr-2 inline-block rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-white no-underline hover:bg-accent-ink">
          Acceso empleado
        </a>
        <a href="/login" className="mt-5 inline-block rounded-[10px] bg-accent px-4 py-2.5 font-semibold text-white no-underline hover:bg-accent-ink">
          Acceso responsable
        </a>
      </div>
    </main>
  )
}
