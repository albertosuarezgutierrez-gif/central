/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las variables de entorno se gestionan en Vercel → Settings → Environment Variables
  // NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY: configuradas en Vercel
  // SUPABASE_SERVICE_ROLE_KEY: solo server-side, configurada en Vercel (nunca hardcodear aquí)
}
module.exports = nextConfig
