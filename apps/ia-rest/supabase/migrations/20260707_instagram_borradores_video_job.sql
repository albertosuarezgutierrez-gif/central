-- instagram_borradores.video_job — estado del job de vídeo/carrusel.
-- El cron de Instagram (rama reel y rama carrusel) y el callback de Telegram
-- (ig_reel_check / ig_aprobar_carrusel) escriben y leen esta columna, pero
-- nunca existió una migración que la creara: en producción faltaba, así que
-- TANTO los Reels IA COMO los carruseles fallaban en el INSERT y caían al
-- flujo de imagen. Columna aditiva, nullable — segura de aplicar en caliente.
--   · Reel IA:  { requestId, statusUrl, responseUrl, modelo, engine, prompt }
--   · Carrusel: { slides, portadaB, ganchoA, ganchoB, gancho_elegido }
alter table public.instagram_borradores
  add column if not exists video_job jsonb;

comment on column public.instagram_borradores.video_job is
  'Estado del job de vídeo/carrusel: reel IA (requestId/statusUrl/responseUrl/modelo/engine/prompt) o carrusel (slides/portadaB/ganchoA/ganchoB/gancho_elegido).';
