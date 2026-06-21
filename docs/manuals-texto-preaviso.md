# Texto para los PDF de manuales — Preaviso de marcha

> Los PDF de `apps/ia-rest/public/manuals/*.pdf` son binarios generados aparte (Claude no los
> regenera). Copia/pega estas secciones al regenerarlos. La ayuda en app (`help-prompts.ts`) y
> `public/manual.html` YA están actualizadas con esto.

---

## `manual_camarero.pdf` — añadir sección "Preaviso de marcha"

**Preaviso de marcha (si el dueño lo ha activado)**

Cuando cocina va a sacar un plato, recibes un aviso para que prepares la mesa ANTES de que salga
(desbarasar, montar el cubierto) y la comida no espere fría.

- Te llega de tres formas a la vez: **notificación push**, un **banner** "Mesa X: salen…" en la
  pantalla, y la **voz en tus cascos** leyéndolo (si tienes la voz activada y la pantalla
  encendida), con una vibración.
- Prepara la mesa y pulsa **"Mesa lista"** en el banner. Cocina lo ve y emplata.
- Con el **móvil bloqueado** en el navegador solo suena el tono del push (no la voz). Con la
  **app de Android** instalada, lo oirás leído aunque tengas la pantalla apagada.
- El preaviso puede llegar porque cocina pulsa el botón, o **solo** (si el dueño configuró un
  tiempo de disparo automático).

---

## `manual_cocina.pdf` — añadir sección "Preaviso de marcha"

**Preaviso de marcha · cocina → sala (si el dueño lo ha activado)**

Sirve para avisar a sala con antelación de que un plato sale ya, para que monten la mesa ANTES de
emplatar.

1. Pulsa **"📣 Preaviso"** en la tarjeta de la comanda. El botón pasa a **"Preaviso enviado ⏳"**
   y el camarero recibe el aviso (push + banner + voz).
2. Cuando el camarero ha montado la mesa, el botón cambia a **"Mesa lista ✅ emplatar"** — entonces
   emplata.
3. Si no ves el botón 📣, el dueño debe activar el preaviso en `/owner → Configuración`.

**Disparo automático (opcional):** si el dueño fija un tiempo, el preaviso sale solo cuando una
comanda lleva esos minutos en cocina, sin que tengas que pulsar nada.

---

## `manual_owner.pdf` — añadir a la sección de Configuración

**Preaviso de marcha cocina ⇄ sala**

En `/owner → Configuración → tarjeta "Preaviso de marcha"`:

- **Casilla de activación** (apagada por defecto). Al activarla aparece el botón **📣 Preaviso**
  en el KDS de cocina y el camarero empieza a recibir los avisos (push + banner + voz en `/edge`).
- **"Disparo automático tras ___ min en cocina"** (0 = solo manual): pon un número de minutos para
  que el preaviso salte solo cuando una comanda lleve ese tiempo sin servir. El botón manual sigue
  disponible igualmente.

Recomendación: empieza con el botón manual unas semanas; los preavisos manuales van registrando
cuánto tardáis de media, base para afinar el tiempo automático más adelante.
