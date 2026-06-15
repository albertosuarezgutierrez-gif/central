import Wordmark from '@/components/Wordmark'

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <Wordmark className="text-4xl" />
        <p className="text-ink-2 mt-3">Portal del Empleado — casa de marcas.</p>
        <a href="/login" className="mt-5 inline-block rounded-[10px] bg-accent px-4 py-2 font-semibold text-white no-underline hover:bg-accent-ink">
          Acceso responsable
        </a>
      </div>
    </main>
  )
}
