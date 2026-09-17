# Lo que tiene que hacer Alberto — prompts listos para Claude en Chrome

> Actualizado el 07/09/2026 **tras contrastarlo contra los paneles**. Cada bloque es un prompt
> independiente: ábrelo con Claude en Chrome, pega el texto y ya está.
>
> 🚨 **Los §1 y §3 se dieron por hechos y eran FALSOS**: ni al token le faltaba un permiso ni
> `GH_PAT_TRIGGER` estaba caducado. Los dos salían de leer notas del repo como si fueran el estado
> de los paneles. Quedan tachados a propósito en vez de borrados — un doc que solo enseña lo que
> queda por hacer no dice dónde se equivocó. **Antes de pedirle a alguien que toque un panel,
> míralo.**
>
> 🚨 **Regla que aplica a todos:** ninguno de estos prompts autoriza a publicar, enviar ni
> contratar nada. Si Claude en Chrome te pide confirmación para algo que no está escrito aquí,
> dile que no.

---

## 1. ~~Ampliar el permiso del token de GitHub~~ — ✅ NO HACE FALTA (comprobado 07/09/2026)

**Este punto estaba MAL y se retira.** Decía que al token de GitHub le faltaba el permiso
«Pull requests: Read and write» y que eso bloqueaba el blog entero. Comprobado en el panel: **los
tres PAT con acceso a `central` ya lo tienen**. El blog no está bloqueado por nada.

De dónde salió el error, porque es el que este repo persigue por escrito: `secrets-registry.ts`
describe ese token como «PAT fine-grained con Repository access = central y **Contents: Read and
write**». Eso decía *lo que el agente SEO necesita*, no *lo que el token tiene*. Se leyó una
descripción parcial como si fuera un inventario y se afirmó una ausencia sin mirarla.

**Lo que sí salió de mirar el panel, y no lo había pedido nadie:**

- `token` (creado el 29/07/2026): **sin acceso a ningún repo y sin ningún permiso**. Vivo e inútil.
  Borrarlo no puede romper nada. Recomendado.
- Hay **dos** `GH_PAT_TRIGGER` para `central` —uno caduca el 01/12/2026, el otro no caduca— con
  propósito aparentemente idéntico. Uno sobra, pero cuál está en uso no se adivina: hay que mirar
  el valor en los secrets del repo y en las envs de Vercel.
- El de septiembre lleva **Workflows: Read/write**, que es más de lo que pide el mínimo. ⚠️ **No lo
  quites a ciegas.** Medido en el repo: ningún código escribe ficheros de `.github/workflows`, y
  para *disparar* un workflow el permiso correcto es `Actions`, no `Workflows`. Pero los pushes de
  las rutinas automáticas van por fuera del código y podrían tocar un `.yml`; si se rompe, se rompe
  en un cron que nadie mira. Quítalo solo después de confirmar cuál de los dos usan esas rutinas.

⚠️ Y una precisión sobre dónde vive esto: la **conexión Git** de Vercel va por GitHub App, no por
PAT. El `GITHUB_TOKEN` del que se habla aquí es una **variable de entorno de runtime** que lee
nuestro propio código (`lib/sivra/seo-landing.ts` y el cron del blog) para llamar a la API de
GitHub — está en Vercel → Settings → **Environment Variables**, no en la integración de Git.

---

## 2. 🔎 Conectar Search Console de `grupoasegura.es`

**Por qué:** hoy los temas del blog salen de una lista escrita a mano
(`lib/correduria/blog-temas.ts`, 5 temas ≈ 10 semanas). Con Search Console conectada, el agente
podrá escribir sobre **lo que la gente busca de verdad y todavía no tenemos cubierto** — que es
como funciona el agente de ia-rest y por qué el suyo acierta más.

**No es urgente para que el blog arranque.** Es lo que evita que se agote la cola.

```
Entra en https://search.google.com/search-console y dime si la propiedad grupoasegura.es
ya está dada de alta. Si no lo está, créala como propiedad de DOMINIO (no de prefijo de URL)
para grupoasegura.es.

Google te pedirá verificar la propiedad con un registro TXT en el DNS. El dominio está en
IONOS. Enséñame el registro TXT exacto que hay que crear (nombre y valor) y espera: NO entres
todavía en IONOS, quiero verlo antes.

Cuando la propiedad esté verificada, dime cuántas impresiones y clics lleva acumulados y en qué
fecha empiezan los datos.
```

⚠️ **El DNS de `grupoasegura.es` está en IONOS y ahí viven cosas que rompen fácil:** el apex
apunta a Vercel (`216.150.1.1`) y `clientes.grupoasegura.es` tiene **MX de IONOS**. Un TXT no
toca nada de eso, pero por si acaso: **no borres ni modifiques ningún registro existente**,
solo añade el TXT nuevo.

---

## 3. ~~Renovar `GH_PAT_TRIGGER`~~ — ✅ TAMPOCO ESTÁ CADUCADO (comprobado 07/09/2026)

Otra afirmación que el panel desmiente: decía «caducado desde el 31/08/2026». Los dos
`GH_PAT_TRIGGER` con acceso a `central` están **vivos** — uno caduca el 01/12/2026 y el otro no
caduca. La creencia venía de una nota de sesión anterior que nadie había vuelto a contrastar.

Lo que sí queda pendiente aquí es la limpieza descrita en el §1: **dos tokens con el mismo
propósito** y uno **sin permisos ni repos** (`token`, del 29/07). Eso es higiene, no una avería.

⏰ El de diciembre sí caduca. Cuando llegue el aviso de GitHub, renuévalo con la MISMA
configuración y actualiza el secret del repo — sin tocar el otro hasta saber cuál usa cada cosa.

---

## 4. ▶️ Reactivar la rutina `agente-correduria` — ✅ HECHO (07/09/2026)

Ya está reactivada; no tienes que hacer nada. Estaba pausada desde el 1 de septiembre.

Antes de reactivarla se leyó su prompt: prohíbe expresamente contactar clientes, leads, compañías y
Codeoscopic (siempre borradores), no saca PII en informes y **no tarifica** — o sea, no gasta. Solo
lee la cartera, busca novedades del sector y deja informe en `docs/AGENTES-BITACORA.md` por PR.

Corre los **martes a las 05:30 UTC** (07:30 en España). Si la habías pausado a propósito, se vuelve
a parar desde `claude.ai/settings` → Routines.

---

## 5. 🗺️ Google Business — los 4 puntos que quedan

**Por qué:** la ficha de Google es el sitio donde más gente ve la correduría antes de entrar en
la web. Los cuatro puntos son de un minuto cada uno y ninguno es opinable.

```
Entra en https://business.google.com y abre la ficha "Grupo ASegura tu corredor de Seguros"
(C. San Juan de la Palma 28, Sevilla · 637 34 99 90).

Haz estos cuatro cambios y ve confirmándome uno a uno:

1. Categoría principal: cámbiala de "Agencia de seguros" a "Correduría de seguros".
   Si esa categoría exacta no existe en el desplegable, dime qué opciones parecidas hay y espera.

2. Nombre del negocio: déjalo exactamente como "Grupo ASegura".
   Las DOS primeras letras van en mayúscula: la "AS" es el monograma del logo (A de Alberto,
   S de Suárez), así que la ese minúscula no es una errata de estilo, se come la marca.
   Cópialo de esta línea tal cual en vez de teclearlo.

3. Horario: dime qué horario tiene puesto ahora mismo. NO lo cambies: quiero verlo antes.

4. Copia la URL canónica de la ficha en Google Maps (la de maps.app.goo.gl o la larga con el
   place ID) y pégamela aquí.

No respondas a ninguna reseña, no publiques ninguna novedad y no subas ninguna foto.
```

---

## 4. 🔌 Enchufar el puente del portal del cliente (08/09/2026)

**Por qué:** desde el PR #2603 el cliente puede corregir su **dirección de contacto** desde el portal
y mandar **sugerencias**. El código está en `main`; lo único que falta son **cuatro variables en
Vercel**. No hay ninguna migración de base de datos.

**Qué pasa si no lo haces:** nada se rompe y nada miente — la pantalla le dice al cliente «no se ha
podido guardar» en vez de darlo por guardado. Simplemente la función no está viva.

```
Ayúdame con unas variables de entorno en Vercel (equipo pisos-turisticos-projects).

REGLAS, antes de empezar:
· NO generes tú ningún secreto ni contraseña. Los valores te los pego yo.
· No toques ninguna variable que empiece por PII_.
· NO pulses nunca "Rotate Variable" en ninguna variable: generaría un valor nuevo y
  dejaría ilegible la cartera de clientes entera.
· No crees proyectos, no cambies dominios, no toques la integración de Git y no borres
  ninguna variable existente.

PASO 1 — Proyecto "asegura-portal" → Settings → Environment Variables
Ve creando estas cuatro, en Production (y también en Preview si te deja marcar las dos).
Para cada una: abre el formulario, dime que estás listo y espera a que yo pegue el valor.
  · ASEGURA_PUENTE_URL  → este sí lo pones tú: https://central-asegura.vercel.app
  · ASEGURA_PORTAL_PUENTE_SECRET  → lo pego yo (márcala Sensitive)
  · TELEGRAM_BOT_TOKEN  → lo pego yo (márcala Sensitive)
  · TELEGRAM_CHAT_ID  → lo pego yo

PASO 2 — Proyecto "central-asegura" → Settings → Environment Variables
  · ASEGURA_PORTAL_PUENTE_SECRET → lo pego yo, y es el MISMO valor del paso 1.
Si esa variable ya existiera con otro valor, PARA y dímelo antes de cambiarla.

PASO 3 — Que se apliquen
Las variables solo entran en vigor con un despliegue nuevo. En cada uno de los dos
proyectos, ve a Deployments y pulsa Redeploy sobre el último de Production.
Si Vercel no te deja ("A more recent Production Deployment has been created") o el
redeploy sale como "Canceled by Ignored Build Step", NO insistas ni cambies nada de
configuración: dímelo y lo desatasco yo desde el repo.

PASO 4 — Dime qué ha quedado
Enséñame la lista de NOMBRES de variables de los dos proyectos (nunca los valores) y el
estado del último deployment de cada uno.
```

🔑 **El secreto lo generas TÚ y lo pegas tú** (dictado de Alberto, 08/09/2026): el agente del
navegador no genera ni maneja contraseñas. `openssl rand -hex 32` en un terminal, o desde la consola
del propio navegador (F12):

```js
Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
```

🚨 **El de `asegura-portal` y el de `central-asegura` tienen que ser IDÉNTICOS.** Si no coinciden, el
puente contesta 401 y el portal le dice al cliente que no se ha podido guardar — no se lo traga en
silencio, pero tampoco funciona, y el 401 no distingue «secreto distinto» de «secreto ausente».

⚠️ **Un aviso sobre el Telegram:** si `TELEGRAM_BOT_TOKEN` está marcada *Sensitive* en el proyecto
donde ya vive (plataforma), **no se puede releer desde el panel** — es un buzón, no un almacén. Si
no lo tienes a mano, sácalo de BotFather (`/mytoken`) o deja esas dos para después: sin ellas el
cambio de dirección funciona igual y lo único que no sale es la sugerencia (y la pantalla lo dice,
no se la traga).

✅ **Cómo comprobar que funciona**, cuando acabes: entra al portal como cliente, abre la bóveda y
usa «Dónde te escribimos» con tu propia ficha. 🚨 **Se aplica de verdad**: escribe tu dirección
buena, no una de prueba. Luego manda una sugerencia y mira si llega el Telegram. Las dos cosas
tienen que aparecer en `/correduria` → tu ficha → 🕘 Historial.

---

## Qué NO tienes que hacer

- **No hay que tocar nada para que el blog funcione.** El cron está declarado y el token tiene los
  permisos que hacen falta (§1). Lo único que queda de tu lado es el §2 (Search Console), que no
  bloquea nada: amplía de qué temas escribe, y la cola aguanta ~4 meses sin él.
- **No hay que aprobar nada en GitHub.** Los artículos se aprueban en `/correduria` → pestaña
  **Redes**, con dos botones. El PR existe para que los tests del repo revisen el artículo antes
  que tú, no para que entres ahí.
- **No hay que escribir los artículos.** Lo que sí hay que hacer es **leerlos antes de pulsar
  Publicar**: la revisión automática comprueba que el artículo no cite normas sin verificar, pero
  **no** comprueba que el razonamiento sea correcto — y va firmado con tu nombre y tu clave DGSFP.
