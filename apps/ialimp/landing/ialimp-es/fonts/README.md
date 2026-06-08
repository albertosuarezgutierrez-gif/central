# fonts/

Aquí van los `.woff2` de **Nunito** auto-alojados (para no cargar Google Fonts y no
transferir datos del visitante a terceros).

**No están en git** (son binarios). Genéralos con el script una vez antes de desplegar:

```bash
bash ../fetch-fonts.sh
```

Esto crea: `nunito-400.woff2`, `nunito-500.woff2`, `nunito-600.woff2`,
`nunito-700.woff2`, `nunito-800.woff2`, `nunito-900.woff2`.

Si añades un peso nuevo en el CSS (`@font-face`), añádelo también en `fetch-fonts.sh`.
