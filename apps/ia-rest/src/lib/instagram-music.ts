// Pool de pistas de música royalty-free (uso comercial) sembradas en Cloudinary
// como resource_type=video. Config por env:
//   CLOUDINARY_MUSIC_IDS="iarest_music_1,iarest_music_2,iarest_music_3"
// Si está vacío → los reels salen sin audio (degradación elegante, no falla).
//
// IMPORTANTE (verificado en investigación 2026-06): la música licenciada in-app de
// Instagram NO se puede añadir por Graph API; debe ir embebida en el MP4 antes de
// publicar. Por eso usamos pistas royalty-free propias montadas por Cloudinary.
export function musicTracks(): string[] {
  return (process.env.CLOUDINARY_MUSIC_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export function pickMusicTrack(): string | null {
  const tracks = musicTracks()
  if (tracks.length === 0) return null
  return tracks[Math.floor(Math.random() * tracks.length)]
}
