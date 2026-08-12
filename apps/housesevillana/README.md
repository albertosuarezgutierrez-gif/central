# housesevillana — landing pública de House Sevillana

`housesevillana.es` · 6 dormitorios / 12 personas, parking, centro de Sevilla.
Es **el canal directo**: motor de reservas Smoobu, WhatsApp de grupos y teléfono. Todo lo que
convierte aquí no paga comisión de OTA, así que cada enlace roto de esta app cuesta dinero real.

## Cómo está hecha

Next.js mínimo servido por rutas `edge`: cada `app/**/route.ts` devuelve el HTML entero como
string (`export const HTML = \`…\``). No hay componentes React ni CSS externo — el CSS va inline
en el propio HTML. Es deliberado: el agente SEO reescribe estos ficheros por la GitHub Contents
API y necesita un objetivo plano y predecible.

- `app/route.ts` — portada (ES). `app/en/route.ts` y `app/it/route.ts` la traducen.
- `app/parking/contenido.ts` — HTML de /parking; `app/parking/traducciones.ts` sus 3 idiomas.
- `app/i18n/motor.ts` — `localizar()` aplica un diccionario al HTML fuente. **No hay copias
  del HTML por idioma**: si las hubiera, la reescritura semanal del agente SEO tocaría solo
  una y las otras dos quedarían congeladas sin que nadie lo notase.
- `app/reservas.ts` — **la URL del motor de reservas, en un solo sitio**. Ver abajo.
- `app/sitemap.xml/route.ts` — 8 URLs (portada ×3 idiomas, parking ×3, barrio, que-ver).

Tests: `pnpm --filter housesevillana test` (`node --test`, sin framework).

## 🔗 La URL de reservas vive en `app/reservas.ts` y en ningún otro sitio

Hasta el 12/08/2026 la URL estaba **copiada a mano en seis páginas**, y las seis apuntaban a
`reservas.house-sevillana.com`, un subdominio **que nunca existió** (sin registro DNS; el campo
"External link" de Smoobu solo redirige, no aloja nada). Los seis botones de "Reservar" de la web
en producción llevaban a un error de DNS. Nadie lo vio porque revisar uno no decía nada de los
otros cinco.

Ahora hay una constante única y un guardián (`app/enlaces.test.ts`) que falla el CI si alguna
página vuelve a escribir la URL a mano o menciona un dominio muerto. El `apartmentId` **no es
opcional**: sin él, el portal de Smoobu lista los cuatro pisos de la cuenta en vez de este.

## Despliegue

Proyecto Vercel **`house-sevillana-landing`** (`prj_bvq0AmjVUecAUgj5BYf5CFFm2BPf`), el mismo que
ya servía la landing cuando vivía en su repo suelto — se **repuntó** a este monorepo en vez de
crear uno nuevo, para que `housesevillana.es` no tuviera que moverse entre proyectos (el DNS de
IONOS ya apunta a Vercel y toca los MX/SPF/DKIM del correo: mejor no rozarlo).

- Root Directory: `apps/housesevillana`
- Build/Install/framework: **sin overrides en el panel** — los define `vercel.json`, y un override
  del panel lo pisaría.
- `ignoreCommand` (obligatorio en todas las apps del monorepo): solo construye si el commit toca
  `apps/housesevillana/`, `packages/` o los manifiestos raíz.

⚠️ **Consecuencia al desplegar a mano:** un commit que solo toque `docs/` —o cuyo asunto lleve
`[skip ci]`— sale **"Ignored"** y el dominio se queda sirviendo el deployment anterior, con la
configuración nueva ya guardada y aspecto de estar hecho. Para forzar un build hay que empujar un
commit que toque esta carpeta.

## El agente SEO reescribe estos ficheros solos

`apps/sivra/lib/seo-landing.ts` (`/api/seo-refresh`, los lunes) sustituye por regex el `<title>`,
la `description`, `og:title`, `og:description` y el primer bloque `ld+json` de `app/route.ts`,
commiteando por la GitHub Contents API.

Por eso los textos de metadatos traducidos **no** van en el diccionario de traducción sino en
`Variante.meta` (`app/en/route.ts`, `app/it/route.ts`): si fueran claves del diccionario, el lunes
el agente cambiaría el original, la clave dejaría de casar y las versiones EN/IT se quedarían con
el título viejo — en silencio, porque nada falla.

## Historia

Se unificó en el monorepo el 12/08/2026 desde el repo suelto `house-sevillana-landing`,
**sin su historia git a propósito**: esa historia contenía una `service_role` de Supabase.
