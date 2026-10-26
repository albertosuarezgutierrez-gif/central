import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import Boton from '@/components/ui/Boton'
import { ENTRADA_ASEGURA } from '@/lib/marca-asegura'

// Portada: marca Grupo ASegura siempre (26/10/2026). Metadatos, manifest y color de barra vienen del layout raíz.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4">
      <div className="my-auto w-full max-w-sm rounded-card border border-line bg-card p-6 text-center sm:p-7">
        <CoMarca alto={30} />
        <h1 className="mt-4 text-xl">Portal del Empleado</h1>
        <div className="mt-5 grid gap-3">
          <Boton href={ENTRADA_ASEGURA} ancho>Soy empleado</Boton>
          <Boton href="/login" ancho>Soy responsable de la empresa</Boton>
        </div>
      </div>
      <div className="w-full"><PieAsegura /></div>
    </main>
  )
}
