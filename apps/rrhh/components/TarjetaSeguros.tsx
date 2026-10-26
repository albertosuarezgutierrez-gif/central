
/** «Mis seguros»: captación voluntaria. Solo viaja el email (y origen) en el enlace; nada de casillas ni consentimientos aquí. */
export default function TarjetaSeguros({ url }: { url: string }) {
  return (
    <section className="my-3 rounded-card border border-line bg-card p-4" aria-labelledby="mis-seguros-t">
      <h2 id="mis-seguros-t" className="text-base font-semibold">Mis seguros — gratis con Grupo ASegura</h2>
      <p className="mt-1 text-sm text-ink-2">
        Sube tus pólizas (coche, hogar…): te las guardamos, te avisamos antes de que venzan y al renovar te hacemos una comparativa.
        Es tuyo y voluntario: tu empresa no ve nada.
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-white no-underline hover:bg-accent-ink sm:w-auto">
        Abrir mis seguros
      </a>
    </section>
  )
}
