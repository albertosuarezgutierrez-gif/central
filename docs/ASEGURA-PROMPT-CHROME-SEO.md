# Encargo para Claude en Chrome — SEO de Grupo ASegura (07/09/2026)

> Copiar de «--- INICIO ---» a «--- FIN ---» y pegarlo en Claude en Chrome.
> Todo lo de aquí es trabajo de **panel**: no se puede hacer desde el repo.
> Lo que sí era código ya está hecho en el PR #2468.

--- INICIO ---

Eres mi agente en el navegador. Trabajas sobre paneles que ya tengo abiertos o en los que ya estoy
identificado. Vas paso a paso y **me informas al terminar cada bloque**, no al final de todo.

## Reglas que no se rompen (si algo te obliga a saltártelas, PARA y dímelo)

1. **No tocas DNS que no te diga explícitamente.** Nada de MX, SPF, DKIM ni ningún registro
   existente. Solo AÑADES los dos registros que se piden abajo. Si un registro ya existe con otro
   valor, **no lo pisas**: me lo cuentas.
2. **No tocas ningún proyecto de Vercel.** Esta tarea no entra en Vercel.
3. **No creas, lees, rotas ni escribes credenciales** (API keys, contraseñas, tokens). Si un paso
   pide una, paras.
4. **No contratas nada de pago.** Ni una prueba gratuita que pida tarjeta.
5. **No publicas nada** en ningún perfil, ni respondes reseñas, ni mandas correos.
6. Si lo que ves **no coincide** con lo que dice este encargo (el panel ha cambiado, el dominio no
   está, hay un aviso raro), **paras y me lo describes**. No improvises un camino alternativo.
7. Datos que puedes usar, y **no inventes ninguno más**:
   - Nombre del negocio: **Grupo ASegura** (con A y S mayúsculas: el monograma «AS» ES el nombre).
   - Dominio: **grupoasegura.es**
   - Dirección: **San Juan de La Palma, nº 28, 41003 Sevilla**
   - Teléfono: **+34 637 34 99 90**
   - Correo: **hola@grupoasegura.es**
   - Categoría: correduría de seguros / agencia de seguros.
   - **HORARIO: no lo sabes. NO lo rellenes.** Si un formulario lo exige para continuar, para y
     pregúntame. Un horario inventado hace que alguien llame y no le cojan.

---

## Bloque 1 — Google Search Console (lo más importante)

Sin esto el SEO se hace a ciegas: no sé por qué consultas entro ni en qué posición.

1. Entra en https://search.google.com/search-console/ con mi cuenta.
2. Añade una propiedad de tipo **Dominio** con `grupoasegura.es` (dominio, no prefijo de URL: así
   cubre `www` y los subdominios de una vez).
3. Google te dará un **registro TXT** de verificación. Cópialo tal cual.
4. Ve al panel de **IONOS** → dominio `grupoasegura.es` → DNS.
5. **AÑADE** ese registro TXT (host `@`, o el que indique Google). **No borres ni modifiques
   ningún TXT que ya exista** — si ya hay uno de SPF u otro servicio, el nuevo se añade al lado.
6. Vuelve a Search Console y pulsa Verificar. Si dice que aún no propaga, espera y reintenta;
   puede tardar minutos u horas.
7. Cuando verifique, en **Sitemaps** envía: `sitemap.xml`
8. Dime: verificado sí/no, y si el sitemap lo ha aceptado (debería listar 11 URL).

## Bloque 2 — Google Business Profile

Es la acción de más retorno por hora de todo el plan y es gratis: es lo que sale cuando alguien
busca «correduría de seguros Sevilla» desde el móvil.

1. Entra en https://business.google.com/ con mi cuenta.
2. Comprueba primero si **ya existe** una ficha de «Grupo ASegura» o de mi dirección (puede haberla
   creado Google solo, o venir de la correduría anterior). Si existe, **no crees otra**: dime cuál
   es y en qué estado está (reclamada / sin reclamar / duplicada).
3. Si no existe, créala con exactamente los datos de la regla 7. **Nombre, dirección y teléfono
   tienen que coincidir letra por letra** con lo que publica la web — si no, Google reparte la señal
   entre dos negocios distintos y el posicionamiento se hunde.
4. Sitio web: `https://grupoasegura.es`
5. **Horario: déjalo sin rellenar o para y pregúntame.**
6. La verificación (postal, llamada o vídeo) la inicias, pero **el código lo meto yo**. Dime qué
   método pide y cuánto tarda.

## Bloque 3 — DNS de `clientes.grupoasegura.es`

Es el dominio bonito del portal del cliente. Hoy el botón de la web apunta a
`asegura-portal.vercel.app`, que funciona pero no es la marca.

En IONOS, DNS de `grupoasegura.es`, **AÑADE**:

- Tipo: **A** · Host: `clientes` · Valor: `216.150.1.1`

🚨 **Tiene que ser un registro A, NO un CNAME**, aunque el panel de Vercel sugiera el CNAME: ese
subdominio tiene **registros MX de IONOS**, y un CNAME en el mismo host los mata. Si ves que ya
existe un A o un CNAME en `clientes`, **para y dímelo antes de tocar nada**.

## Bloque 4 — Comprobaciones (solo mirar, no cambiar)

Dime lo que veas, sin arreglar nada:

1. **Cookiebot** (https://admin.cookiebot.com): ¿está `grupoasegura.es` dado de alta en la lista de
   dominios del CBID que usamos? Si no lo está, la web **no pinta banner y por tanto no mide nada** —
   es lo correcto legalmente, pero silencioso, y quiero saberlo.
2. En Cookiebot, ¿cuál es la **caducidad del consentimiento**? Debería poder ponerse a **395 días**
   y creo que está en 12 meses. **No lo cambies**: dime qué opciones ofrece.
3. En IONOS, ¿existe un registro TXT `_dmarc.grupoasegura.es`? Si existe, **pégame su valor tal
   cual**. No lo modifiques.

---

## Cómo me informas

Por bloque, y corto:
- Qué has hecho.
- Qué ha respondido el panel (literal si es un error).
- Qué NO has podido hacer y por qué.
- Cualquier cosa que te haya obligado a parar.

Si algo te parece que debería hacerse pero no está en este encargo, **no lo hagas**: propónmelo.

--- FIN ---
