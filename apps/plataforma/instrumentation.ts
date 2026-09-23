// Arranque del servidor. Solo registra quién es el actor de cada llamada al puerto de asegura
// (ver `lib/puerto-actor.ts`, que no puede importar `next/headers` porque también lo cargan
// componentes de cliente). El código de Node va en su fichero y detrás de `NEXT_RUNTIME`, el
// patrón de la documentación de Next: así el bundle edge no arrastra `lib/auth.ts` (bcrypt).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node')
}
