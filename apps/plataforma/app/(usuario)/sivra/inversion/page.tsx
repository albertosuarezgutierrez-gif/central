import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// RETIRADA (02/09/2026). Era el lector viejo de anuncios de portal con «puntuación de chollo» a ojo.
// Lo sustituyó `/subastas` en el PR #1117 («inversión unificada con subastas», 28/07/2026), que mide
// el chollo contra la MEDIANA de €/m² de su zona en vez de con una nota estimada. Ese PR ya la quitó
// del menú y su propio mensaje dejaba escrito que el lector llevaba «parado desde mayo».
//
// 🚨 Lo que destapó el inventario del 02/09/2026: se quedó en disco con **616 líneas** —la tercera
// pantalla más grande de la app— SIN un solo enlace en todo el repo. Nadie podía abrirla pulsando,
// así que nadie iba a notar si dejaba de funcionar. Desenchufar una pantalla y dejar el cuerpo es
// la forma de que la poda no ocurra nunca.
//
// Sus rutas `/api/sivra/inversion*` siguen en pie a propósito: no las alimenta ningún cron y solo las
// consumía esta página, pero retirar API + tabla es una decisión de datos, no de navegación.
export default function InversionPage() {
  redirect('/subastas')
}
