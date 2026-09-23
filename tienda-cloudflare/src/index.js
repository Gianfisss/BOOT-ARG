// Punto de entrada del Worker: rutas /api/* + tarea programada.
// Los archivos de la carpeta public/ (index.html, pedidos.html) los sirve
// Cloudflare directamente, sin pasar por acá.

import { crearPago } from "./crear-pago.js";
import { estadoPago } from "./estado-pago.js";
import { webhookMP } from "./webhook-mp.js";
import { buscarPedido } from "./buscar-pedido.js";
import { servirStock, sincronizarStock } from "./stock.js";
import { json } from "./util.js";

export default {
  async fetch(request, env, ctx) {
    const ruta = new URL(request.url).pathname.replace(/\/+$/, "");
    try {
      switch (ruta) {
        case "/api/crear-pago":    return await crearPago(request, env);
        case "/api/estado-pago":   return await estadoPago(request, env);
        case "/api/webhook-mp":    return await webhookMP(request, env);
        case "/api/buscar-pedido": return await buscarPedido(request, env);
        case "/api/stock":         return await servirStock(request, env, ctx);
      }
    } catch (err) {
      console.error("Error no controlado en", ruta, err);
      return json({ error: "Error interno" }, 500);
    }
    return json({ error: "No encontrado" }, 404);
  },

  // Cron Trigger (cada hora): reemplaza a la función programada de Netlify.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sincronizarStock(env));
  },
};
