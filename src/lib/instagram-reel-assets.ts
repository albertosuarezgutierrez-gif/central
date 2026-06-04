// Pool de clips de AMBIENTE (hostelería real: bar, cocina, sala, camareros)
// royalty-free de uso comercial — descargados de Pexels/Pixabay y sembrados en
// Cloudinary como resource_type=video con public_id `iarest_amb_1..N`.
//
// Config por env:
//   CLOUDINARY_AMBIENT_IDS="iarest_amb_1,iarest_amb_2,iarest_amb_3"
//
// Degradación elegante: si está vacío, el reel se monta SIN footage (solo slides
// de texto + mockup de producto + música). En cuanto se siembran clips y se rellena
// la env, el reel intercala ambiente real sin tocar código.
//
// Licencia: Pexels/Pixabay permiten uso comercial sin atribución. La curación y la
// siembra se hacen una sola vez vía /api/super/instagram/seed-reel-assets (corre en
// producción, donde hay red; el contenedor de Claude Code no alcanza Cloudinary/Pexels).
export function ambientClips(): string[] {
  return (process.env.CLOUDINARY_AMBIENT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

// Devuelve hasta `n` clips de ambiente distintos, en orden aleatorio.
// Si hay menos de `n` sembrados, devuelve los que haya (puede ser []).
export function pickAmbient(n: number): string[] {
  const pool = [...ambientClips()]
  // Fisher-Yates parcial
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.max(0, n))
}
