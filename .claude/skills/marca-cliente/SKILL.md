---
name: marca-cliente
description: Alta/intake de la identidad corporativa de un cliente o tenant de la casa de marcas y aplicación 100% a su app. Úsala cuando entre un cliente nuevo (Joaquín Jaén, Rico González, Global…) o haya un rebrand y haya que dejar su UI IDÉNTICA a SU marca (logo real, colores exactos, tipografía), o cuando Alberto pida "adáptalo a la imagen corporativa de X" / "que sea corporativo 100%". Convierte la marca cruda (su logo + su web + fotos) en un objeto `Marca` de `@central/brand` y lo enchufa. NO es un agente programado: es un flujo bajo demanda. Complementa la skill `adobe-diseno` (vectorizar/limpiar el logo) y Adobe Fonts (tipografía exacta).
---

# Alta de marca de cliente (`marca-cliente`)

Deja la UI de un cliente idéntica a SU identidad, de forma **repetible** y a coste marginal para el siguiente. Probado con Joaquín Jaén (17/07/2026). Regla de oro: **nada de aproximar lo que se puede sacar exacto del material del cliente.**

## Arquitectura

- **`packages/brand` (`@central/brand`)** — pieza compartida:
  - `src/tipos.ts`: contrato `Marca { id, nombre, paleta, tipografia, logos, radio }`.
  - `src/css.ts`: `emitirRootCss(marca)` → bloque `:root{…}` con los nombres de variable que ya usan los `globals.css` (`--bg`,`--accent`,`--text`,`--serif`,`--sans`…) **+** los de marca (`--brand`,`--brand-ink`,`--brand-soft`).
  - `src/marcas/<cliente>.ts`: el objeto `Marca` de cada cliente.
- **La app** consume la marca inyectando `emitirRootCss(MARCA)` en un `<style>` del `<head>` (`app/layout.tsx`) + el `<link>` de fuentes → **sobreescribe** los tokens base sin reescribir el CSS.
- **`--brand`** = color dominante (identidad/títulos/acciones); **`--accent`** = decorativo (filetes/bordes/monograma). No confundir.

## Flujo probado (pasos)

### 1. Consigue el material
- **Logo** (lo más importante). Ideal vector (`.svg/.ai/.pdf/.eps`); si es **PNG/JPG en alta con fondo transparente, también sirve** (Joaquín Jaén se hizo con un PNG 401×141). Si solo hay raster con fondo, límpialo/vectorízalo con `adobe-diseno` (`image_vectorize`, `image_remove_background` — disponibles aunque la generación de imágenes NO lo esté en este entorno).
- Opcional: su **web** (mejor `.mht`, trae CSS/fuentes sin red) y **fotos** para hero.

### 2. Extrae los COLORES EXACTOS del propio logo
No los estimes a ojo. En este entorno no hay PIL ni ImageMagick, así que decodifica el PNG con **Node + zlib** y cuenta colores dominantes (ignora casi-blanco/negro y alfa<200). Script de referencia (funciona con PNG RGBA de 8 bits):

```js
// node png.cjs  → imprime los hex dominantes (los 2 primeros suelen ser marca+acento)
const fs=require('fs'),zlib=require('zlib');
const buf=fs.readFileSync(process.argv[2]||'logo.png');
let p=8,W,H,idat=[];
while(p<buf.length){const len=buf.readUInt32BE(p),t=buf.toString('ascii',p+4,p+8),d=buf.slice(p+8,p+8+len);
  if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+len;}
const raw=zlib.inflateSync(Buffer.concat(idat)),ch=4,st=W*ch,out=Buffer.alloc(H*st);
const pae=(a,b,c)=>{const q=a+b-c,x=Math.abs(q-a),y=Math.abs(q-b),z=Math.abs(q-c);return x<=y&&x<=z?a:y<=z?b:c};
let r=0;for(let y=0;y<H;y++){const f=raw[r++];for(let x=0;x<st;x++){const v=raw[r++],a=x>=ch?out[y*st+x-ch]:0,b=y>0?out[(y-1)*st+x]:0,c=(x>=ch&&y>0)?out[(y-1)*st+x-ch]:0;out[y*st+x]=(f===0?v:f===1?v+a:f===2?v+b:f===3?v+((a+b)>>1):v+pae(a,b,c))&255;}}
const m=new Map();for(let i=0;i<W*H;i++){const R=out[i*4],G=out[i*4+1],B=out[i*4+2],A=out[i*4+3];if(A<200)continue;const mx=Math.max(R,G,B),mn=Math.min(R,G,B);if(mx>235&&mn>225)continue;if(mx<25)continue;const k=((R>>4)<<8)|((G>>4)<<4)|(B>>4);m.set(k,(m.get(k)||0)+1);}
[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,n])=>{const R=((k>>8)&15)*17,G=((k>>4)&15)*17,B=(k&15)*17;console.log('#'+[R,G,B].map(x=>x.toString(16).padStart(2,'0')).join(''),'x'+n);});
```
(JJ dio `#004433` verde + `#998855` oro.) Del `.mht` de su web saca las **fuentes**: `grep -aoiE "font-family:[^;]{0,40}" web.mht | sort | uniq -c | sort -rn`.

### 3. Tipografía profesional (el punto delicado)
- **El nombre de marca NO se re-escribe con una fuente parecida.** Se usa el **logotipo real** (imagen/vector) como marca en login y cabeceras. Eso elimina el "no es su tipografía".
- **Para la UI** (títulos, cuerpo) hace falta fuente **con licencia web**:
  1. Si su **manual** nombra la fuente y está en **Adobe Fonts** (Creative Cloud ya conectado), se incrusta EXACTA vía "web project" (Typekit) → lo más fiel.
  2. Si no, se elige el match libre más cercano de Google Fonts (p. ej. su lettering Didone → **Playfair Display**; su web ya usaba Montserrat/Lato). 
- Carga las fuentes por `<link>` a Google Fonts en el `<head>` (el build tiene la red capada; `next/font/google` descarga en build y puede fallar — evítalo).

### 4. Crea el objeto `Marca`
`packages/brand/src/marcas/<cliente>.ts` con paleta (hex EXACTOS), tipografía (con `googleFontsHref`) y `logos.lockup` apuntando al PNG/SVG en `apps/<app>/public/`. Expórtalo en `src/index.ts`.

### 5. Enchúfalo en la app
- `dependencies`: `"@central/brand": "workspace:*"`; `next.config.ts` → `transpilePackages` incluye `@central/brand`.
- `app/layout.tsx`: inyecta `emitirRootCss(MARCA)` + `<link>` de fuentes.
- **Logo del login: EMBÉBELO en base64** (data-URI) para que no falle la carga ni la caché (`base64 -w0 logo.png` → módulo `LOGO_*_DATAURI`). En cabeceras basta `<img src="/logo.png">`.
- Repunta en `globals.css` lo que deba ir en `--brand` (verde/primario): `h1`, wordmark, nav activo, botón primario, chips, focus, precios, títulos de tarjeta; deja el **acento** para filetes/bordes (el filete superior de oro en tarjetas es un buen sello).

### 6. Verifica de VERDAD (captura)
Levanta `next start` y saca captura con Playwright (`/opt/node22/lib/node_modules/playwright`, chromium en `/opt/pw-browsers/chromium`), móvil y escritorio. Comprueba `getComputedStyle(document.documentElement).getPropertyValue('--brand')` y que el logo cargó (`img.complete`). Enséñale la captura a Alberto.

### 7. Entrega
PR draft con la captura; anota en `docs/CONTEXTO-SESIONES.md`.

## Reglas del monorepo
Responsive ≥320 px, dinero español (`2.162,49€`), listas paginadas (ver `CLAUDE.md`). Nada de secretos en `Marca` (son colores/fuentes/rutas públicas).

## Reutilización
El primer cliente paga la infraestructura (`@central/brand` + esta skill). Cada cliente nuevo = pasos 1–7 con su material → su `src/marcas/<cliente>.ts`. Multi-tenant (almacen, ialimp, rrhh): resolver la marca por cuenta/tenant en el layout. Verticales de marca única: token estático.
