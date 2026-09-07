# Lo que tiene que hacer Alberto — prompts listos para Claude en Chrome

> Actualizado el 07/09/2026. Cada bloque es un prompt independiente: **ábrelo con Claude en
> Chrome, pega el texto y ya está.** Están ordenados por lo que desbloquean, no por dificultad.
>
> 🚨 **Regla que aplica a todos:** ninguno de estos prompts autoriza a publicar, enviar ni
> contratar nada. Si Claude en Chrome te pide confirmación para algo que no está escrito aquí,
> dile que no.

---

## 1. 🔑 Ampliar el permiso del token de GitHub — BLOQUEA EL BLOG ENTERO

**Por qué:** el `GITHUB_TOKEN` de Vercel se creó para el agente SEO de House Sevillana, que solo
necesita **escribir ficheros**. El agente del blog necesita además **abrir un PR** y, cuando tú
pulses «Publicar», **mezclarlo**. Con el permiso actual el artículo se escribe en la rama y el PR
no aparece — o sea, se ve exactamente igual que si el agente no hubiera hecho nada.

**Cómo saber si ya está bien sin tocar nada:** si el día 1 o el 15 te llega el Telegram
«📝 Blog ASegura — artículo listo para revisar» con un enlace a un PR, está bien. Si te llega
«no he podido abrir el PR», es esto.

```
Entra en https://github.com/settings/personal-access-tokens y busca el fine-grained personal
access token que tiene acceso al repositorio albertosuarezgutierrez-gif/central (el que usa
Vercel, no el de GitHub Actions).

Dime:
1. Qué permisos de repositorio tiene ahora mismo (la lista entera, con su nivel).
2. Cuál es su fecha de caducidad.

Después, SIN cambiar ninguno de los que ya tiene, añádele el permiso
"Pull requests" con nivel "Read and write" y guarda.

No crees un token nuevo, no regeneres el valor y no cambies el Repository access.
Si al guardar GitHub te obliga a regenerar el token, PARA y dímelo antes de hacerlo:
regenerarlo invalidaría el valor que está puesto en Vercel y hay que actualizarlo allí también.
```

⚠️ **Si acabas regenerando el token** (porque GitHub obligue), hay que pegar el valor nuevo en
**dos** proyectos de Vercel a la vez: `plataforma` y `sivra`. Comparten el mismo valor, y dejar
uno viejo mata el agente SEO de House Sevillana en silencio.

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

## 3. 🔁 Renovar `GH_PAT_TRIGGER` (caducado desde el 31/08/2026)

**Por qué:** es el token con el que las rutinas programadas de Claude Code se disparan solas.
Caducado, las rutinas no arrancan y **no avisa nadie**: se ve igual que un día sin trabajo.

```
Entra en https://github.com/settings/personal-access-tokens y busca el token llamado
GH_PAT_TRIGGER (o el que tenga ese propósito: disparar workflows del repo
albertosuarezgutierrez-gif/central).

Dime su estado y su fecha de caducidad. Si está caducado, regenéralo con la MISMA configuración
que tenía (mismos permisos, mismo Repository access) y caducidad de 1 año.

Cuando tengas el valor nuevo, NO me lo pegues en el chat. Ve directamente a
https://github.com/albertosuarezgutierrez-gif/central/settings/secrets/actions y actualiza
con él el secret que corresponda, y dime solo el nombre del secret que has actualizado.
```

---

## 4. ▶️ Reactivar la rutina `agente-correduria` (está pausada)

```
Entra en https://claude.ai/settings y busca en las rutinas programadas (Routines) la que se
llama agente-correduria. Dime desde cuándo está pausada, cuál es su horario y cuándo fue su
última ejecución con éxito.

No la reactives todavía: enséñame primero el prompt que tiene guardado.
```

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
   Se escribe con A y S mayúsculas: la "AS" es el monograma del logo (A de Alberto, S de Suárez).
   Ni "Grupo Asegura" ni "Grupo asegura".

3. Horario: dime qué horario tiene puesto ahora mismo. NO lo cambies: quiero verlo antes.

4. Copia la URL canónica de la ficha en Google Maps (la de maps.app.goo.gl o la larga con el
   place ID) y pégamela aquí.

No respondas a ninguna reseña, no publiques ninguna novedad y no subas ninguna foto.
```

---

## Qué NO tienes que hacer

- **No hay que tocar nada en Vercel** para que el blog funcione: el cron ya está declarado y el
  token ya existe (solo le falta el permiso del punto 1).
- **No hay que aprobar nada en GitHub.** Los artículos se aprueban en `/correduria` → pestaña
  **Redes**, con dos botones. El PR existe para que los tests del repo revisen el artículo antes
  que tú, no para que entres ahí.
- **No hay que escribir los artículos.** Lo que sí hay que hacer es **leerlos antes de pulsar
  Publicar**: la revisión automática comprueba que el artículo no cite normas sin verificar, pero
  **no** comprueba que el razonamiento sea correcto — y va firmado con tu nombre y tu clave DGSFP.
