# Tienda BOOT.ARG en Cloudflare (Workers) + Mercado Pago

Todo corre en **un solo Worker de Cloudflare**: sirve tu sitio (`public/`), las funciones `/api/*`, guarda pedidos y stock en **KV**, y sincroniza el stock del proveedor con un **Cron** cada hora. Ya no se usa nada de Netlify.

## Estructura
```
public/index.html, pedidos.html   → el sitio (lo único que ve el público)
src/                              → funciones del servidor (crear-pago, estado-pago, webhook-mp, buscar-pedido, stock)
src/catalogo.json                 → precios/zonas que usa el servidor para cobrar
scripts/generar-catalogo.js       → regenera catalogo.json desde public/index.html
wrangler.jsonc                    → configuración de Cloudflare
```

## Puesta en marcha (una sola vez, ~10 minutos)
Necesitás una cuenta gratuita en cloudflare.com y Node.js 18+ instalado.

```bash
npm install
npx wrangler login                       # abre el navegador para autorizar
npx wrangler kv namespace create TIENDA  # imprime un "id": copialo en wrangler.jsonc (reemplaza PEGAR_ACA_EL_ID_DEL_KV)
npx wrangler deploy                      # publica el sitio; te da una URL https://boot-arg-tienda.<algo>.workers.dev
npx wrangler secret put MP_ACCESS_TOKEN  # pegá tu Access Token de Mercado Pago
npx wrangler secret put PEDIDOS_CLAVE    # inventá una clave para pedidos.html
```

`MP_ACCESS_TOKEN` es el mismo token que ya usabas en Netlify (`APP_USR-...`). Recomendado: probá primero con el token de **prueba** (`TEST-...`), hacé un pedido de punta a punta y recién después cambiá al de producción con el mismo comando `secret put`.

## Cómo probar que quedó perfecto
1. Abrí `https://TU-URL/api/stock` → tiene que devolver un JSON con `porImagen` y `nuevos`.
2. Hacé un pedido, tocá "Pagar con Mercado Pago" y pagá con una tarjeta de prueba.
3. Al volver a la tienda tiene que decir que el pago se acreditó.
4. Abrí `https://TU-URL/pedidos.html`, pegá el código `BA-...` y la clave: el estado tiene que decir **Pagado**.
5. En el panel de Cloudflare → tu Worker → **Logs** podés ver cualquier error en vivo.

## Dominio propio
Cloudflare → Workers & Pages → tu Worker → **Settings → Domains & Routes → Add → Custom domain**. El dominio tiene que usar los nameservers de Cloudflare (si lo tenés en otro lado, agregalo en Cloudflare como "Add a site" y cambiá los nameservers en tu registrador). No hace falta tocar nada en Mercado Pago: las URLs de retorno y aviso se arman solas con el dominio desde el que se compra.

## Lo que cambió respecto a Netlify
| Antes (Netlify) | Ahora (Cloudflare) |
|---|---|
| Netlify Functions | Un Worker (`src/index.js`) |
| Netlify Blobs | Cloudflare KV (binding `TIENDA`) |
| Función programada `@hourly` | Cron Trigger `0 * * * *` (UTC) |
| SDK `mercadopago` de npm | API REST de Mercado Pago con `fetch` (no depende de Node) |
| Variables de entorno en Netlify | `wrangler secret put` |

## Mejoras incluidas (arreglos de cosas que tenía el código anterior)
- **Webhook de Mercado Pago (`/api/webhook-mp`)**: si el cliente paga y cierra el navegador antes de volver, el pedido igual queda como *Pagado*. Se configura solo (va dentro de cada pago); no hay que tocar el panel de MP. Nunca se confía en lo que llega: se le vuelve a preguntar a Mercado Pago.
- **Productos "nuevos" del proveedor ahora se pueden comprar.** Antes aparecían en la tienda pero `crear-pago` no los conocía y el pago fallaba con "Producto inexistente".
- **Falla de seguridad cerrada en `pedidos.html`**: el color/talle de un pedido se mostraba sin escapar, y lo escribe el cliente. Ahora se escapa, y además el servidor valida talle y limpia los textos.
- El pedido se guarda **después** de crear el pago en Mercado Pago (sin pedidos huérfanos) y siempre antes de que el cliente pueda pagar.
- Se eliminó el log de diagnóstico que imprimía el comienzo del token, y se quitó de `index.html` el script/comentarios de Netlify.
- En Netlify se publicaba toda la carpeta (incluidos `.md`, `.json`, helpers). Ahora solo se publica `public/`.

## Si cambiás precios, productos o zonas
Editá `public/index.html` y corré:
```bash
npm run catalogo
npm run deploy
```
(Si no regenerás el catálogo, Mercado Pago cobra los precios viejos.)

## Cosas a tener en cuenta
- **Pedidos viejos:** los pedidos guardados en Netlify Blobs no se copian solos. Dejá el sitio de Netlify activo unos días (por pagos en curso y para consultar direcciones viejas) y después lo das de baja.
- **KV es de consistencia eventual:** un pedido nuevo puede tardar hasta ~1 minuto en verse desde otra región en `pedidos.html`. En la práctica el cliente tarda más que eso en pagar.
- **Publicar con Git en vez de la consola:** también podés subir esta carpeta a GitHub y conectarla en Cloudflare (Workers & Pages → Create → Import a repository). Los secretos y el KV se cargan igual.
- Para probar en tu compu: copiá `.dev.vars.example` a `.dev.vars` y corré `npm run dev`.
