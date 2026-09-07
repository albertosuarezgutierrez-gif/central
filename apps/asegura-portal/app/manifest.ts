import type { MetadataRoute } from 'next'
import { MARCA_ASEGURA } from '@central/brand'
import { MEDIADOR } from '@central/module-seguros'

/**
 * El manifiesto que convierte el portal en algo INSTALABLE.
 *
 * ── Por qué (07/09/2026) ────────────────────────────────────────────────────
 * Alberto: «he visto que a veces entro en una web y me aparece la opción de
 * instalar; estoy pensando en algo así para cuando entren nuestros clientes».
 * Eso es una PWA, y para el portal del asegurado es justo lo que le falta: hoy
 * llega por un enlace del correo, y el día que quiera mirar su póliza tiene que
 * volver a buscar el correo. Instalado, es un icono en su pantalla de inicio.
 *
 * 🚨 El manifiesto NO basta por sí solo: Chrome solo ofrece instalar si además
 * hay un service worker registrado con manejador de `fetch` (`public/sw.js`, lo
 * registra `app/RegistrarSW.tsx`). Y en iOS no hay oferta ninguna: Safari no
 * implementa `beforeinstallprompt` y el usuario tiene que ir a Compartir →
 * Añadir a pantalla de inicio, así que la UI se lo explica a mano
 * (`app/(portal)/InstalarApp.tsx`). Lo vigila `lib/pwa.test.ts`.
 *
 * ⚠️ Los colores tienen que ser HEX: de la paleta de marca, los neutros van en
 * `oklch()` y el manifiesto lo consumen navegadores y lanzadores de Android que
 * no lo parsean — un color ilegible aquí no falla, se ignora.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { primario, acentoSuave } = MARCA_ASEGURA.paleta

  return {
    // El nombre largo es el de la ficha de instalación; el corto, el que cabe
    // debajo del icono en la pantalla de inicio (~12 caracteres).
    name: `Mis seguros — ${MEDIADOR.marca}`,
    short_name: 'Mis seguros',
    description: 'Tus pólizas, recibos y partes de siniestro con tu correduría.',
    lang: 'es',
    // La raíz mira la cookie y manda a la bóveda si la sesión sigue viva, así
    // que abrir la app instalada entra directo durante los 30 días de sesión.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: acentoSuave,
    theme_color: primario,
    icons: [
      { src: '/icono-app', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icono-app', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
