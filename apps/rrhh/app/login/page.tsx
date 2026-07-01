import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { estiloMarca } from '@/lib/branding'
import LoginForm from './LoginForm'

export default async function Login() {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT nombre, color_primario, logo_path FROM rrhh.empresas LIMIT 1`)
  const e = rows[0] ?? {}
  const logoUrl = e.logo_path?.startsWith('/') || e.logo_path?.startsWith('http') ? e.logo_path : null

  return (
    <main className="grid min-h-screen place-items-center p-4"
      style={estiloMarca(e.color_primario) as React.CSSProperties}>
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-card p-7 shadow-sm">
        {logoUrl
          ? <img src={logoUrl} alt={e.nombre ?? 'Logo'} className="max-h-14 w-auto max-w-[200px] object-contain" />
          : <span className="text-2xl font-bold">ia·rrhh</span>
        }
        <h1 className="mt-3 text-xl">Acceso responsable</h1>
        <LoginForm />
      </div>
    </main>
  )
}
