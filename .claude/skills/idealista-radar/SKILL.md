---
name: idealista-radar
description: Rutina PROGRAMADA diaria que busca CASAS de 3+ dormitorios cerca de la playa en la costa de Huelva con el conector de Idealista y las mete en el corpus `mercado_comparables` (radar de subastas/chollos/lente 🌊). Sustituye a las alertas de correo de Idealista (Fotocasa sigue por correo). Úsala al disparo diario o si Alberto pide "mira Idealista en la costa". Sin secretos.
---

# Radar de Idealista por conector (costa de Huelva)

**Qué haces:** una búsqueda por núcleo de playa con el conector de **Idealista**, mandas los anuncios
a plataforma y dejas el latido. Nada más. No decides compras, no avisas tú de cada casa (los avisos
de chollos, 🌊 casas de playa y bajadas los saca el cron `subastas-mercado` sobre el corpus, igual
que con los correos) y no contactas con ningún anunciante.

## Por qué existes (24/09/2026)

Alberto quitó las alertas de correo de Idealista: solo cubrían las búsquedas que él guardaba a mano.
Un conector solo se usa desde una sesión, no desde un cron, así que esto es una rutina. **Desde ese
día eres la única vía por la que entra Idealista al corpus**: si no corres, el radar de casas de
playa calla y ese silencio se lee como «no hay nada».

## 🚨 No romper

- **La zona la manda el NÚCLEO, no el título.** Idealista titula los anuncios de Matalascañas como
  «…, Almonte». Manda cada búsqueda con su `nucleo` exacto de la tabla de abajo. El servidor zonifica
  con ese nombre y descarta lo que cae fuera de su radio (`fueraDeZona`).
- **Manda los anuncios TAL CUAL, recortados a estos campos**: `propertyCode, price, size, rooms,
  priceByArea, status, latitude, longitude, suggestedTexts{title}, detailedType{typology}`.
  **No inventes ni corrijas nada.** Sin `description`, fotos ni teléfonos: no hacen falta y engordan
  el cuerpo (el script pasa el JSON como argumento, y un argumento de más de ~128 KB revienta).
- **«El conector no contestó» NO es «no hay casas».** Cuéntalo como `sinRespuesta` y sigue.
- **0 resultados** en un núcleo pequeño (Matalascañas daba 3) es un dato válido: cuéntalo igual.
- **Auth: `bash scripts/canal-aviso.sh`** (lee `PLATAFORMA_URL` + `ALERTA_TOKEN` del entorno).
  **NO uses `CRON_SECRET`.**

## Pasos

### 1. Busca cada núcleo (`search_properties`)
Parámetros fijos: `country: "es"`, `locale: "es-ES"`, `operation: "SALE"`, **`propertyType: "CHALET"`**
(casas, chalets, adosados y pareados; no pisos) y `maxResults: 50`.
`query` = `casa o chalet de 3 o más dormitorios cerca de la playa en <búsqueda>`.

| nucleo (se manda tal cual) | búsqueda |
|---|---|
| Isla Canela | Isla Canela, Ayamonte |
| Isla Cristina | Isla Cristina, Huelva |
| Islantilla | Islantilla, Huelva |
| La Antilla | La Antilla, Lepe |
| El Rompido | El Rompido, Cartaya |
| El Portil | El Portil, Punta Umbría |
| Punta Umbría | Punta Umbría, Huelva |
| Mazagón | Mazagón, Moguer |
| Matalascañas | Matalascañas, Almonte |

Criterios de Alberto: costa de Huelva, cerca de la playa, **3 o más dormitorios**, mejor casa que
piso. Si falta un núcleo, no lo añadas aquí sin darle antes su centro en `CENTROS`
(`packages/module-subastas/src/idealista-api.ts`): sin centro, el servidor rechaza la búsqueda (error
en `porNucleo`).

### 2. Escribe (una llamada por núcleo)
```
bash scripts/canal-aviso.sh POST /api/subastas/mercado/idealista '{"busquedas":[{"nucleo":"Islantilla","properties":[{"propertyCode":"110709609","price":185000,"size":68,"rooms":3,"priceByArea":2721,"status":"good","latitude":37.2112431,"longitude":-7.2453481,"suggestedTexts":{"title":"Chalet adosado en Avenida del Deporte, Islantilla Golf, Islantilla"},"detailedType":{"typology":"chalet"}}]}]}'
```
Devuelve `{comparables, upserts, fueraDeZona, porNucleo[]}`. Es idempotente: repetir un núcleo solo
actualiza el precio, y si el precio ha bajado lo registra como bajada.

### 3. Latido (OBLIGATORIO, también si fue mal)
```
bash scripts/canal-aviso.sh POST /api/internal/latido '{"agente":"subastas_idealista","ok":<true|false>,"detalle":"<parte>"}'
```
`ok = true` solo si escribiste en al menos la mitad de los núcleos. En el `detalle`, por este orden:
anuncios escritos y núcleos buscados · ⚠️ núcleos sin respuesta del conector · fuera de zona · errores.
Ejemplo: `«41 casas en 9/9 núcleos · 3 fuera de zona descartadas»`.

### 4. Cierra
Pon una línea en `docs/AGENTES-BITACORA.md` con los núcleos, los anuncios escritos y lo que falló.
Si hay dos pasadas malas seguidas, avisa con
`bash scripts/canal-aviso.sh POST /api/internal/alerta '<aviso>'`.

## Envs y conector
`PLATAFORMA_URL` + `ALERTA_TOKEN`. Conector requerido: **idealista**, y ninguno más.
