import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import { estiloMarcaEmpresa, marcaDePeticion, metadataMarcaAsegura, themeColorMarca } from '@/lib/marca-asegura'
import LoginForm from './LoginForm'

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

export default async function Login({ searchParams }: { searchParams: SP }) {
  const asegura = await marca(searchParams)
  return (
    <main className={`flex min-h-screen flex-col items-center p-4${asegura ? ' marca-asegura' : ''}`} style={estiloMarcaEmpresa(asegura, null) as React.CSSProperties}>
      <div className="my-auto w-full max-w-sm rounded-[18px] border border-line bg-card p-7 shadow-sm">
        {asegura ? <CoMarca alto={30} /> : <span className="text-2xl font-bold text-ink">ia·rrhh</span>}
        <h1 className="mt-3 text-xl">Acceso responsable</h1>
        <LoginForm />
      </div>
      {asegura && <div className="w-full"><PieAsegura /></div>}
    </main>
  )
}
