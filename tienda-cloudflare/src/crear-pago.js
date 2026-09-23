// POST /api/crear-pago
// Recibe el carrito, RECALCULA todo con el catálogo del servidor (nunca confía
// en un total que venga del navegador) y crea la preferencia de Mercado Pago.

import catalogo from "./catalogo.json";
import { mpFetch } from "./mercadopago.js";
import { json, limpiar } from "./util.js";

const STOCK_KEY = "stock:actual";

async function productosAutomaticos(env) {
  try {
    const s = await env.TIENDA.get(STOCK_KEY, "json");
    return (s && s.nuevos) || [];
  } catch { return []; }
}

async function calcularTotales(env, items) {
  // Los productos "auto-…" los publica sola la sincronización con el proveedor:
  // no están en catalogo.json, viven en el último stock guardado.
  const auto = items.some(i => String(i.id).startsWith("auto-")) ? await productosAutomaticos(env) : [];
  const buscar = id => catalogo.productos.find(p => p.id === id) || auto.find(p => p.id === id);

  const porCat = {};
  const detalle = [];
  for (const it of items) {
    const p = buscar(String(it.id));
    if (!p) throw new Error("Uno de los productos ya no está disponible. Actualizá la página y armá el pedido de nuevo.");
    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    const size = limpiar(it.size, 6);
    if (!/^\d{2}(\.5)?$/.test(size)) throw new Error("Talle inválido");
    porCat[p.cat] = (porCat[p.cat] || 0) + qty;
    detalle.push({ p, qty, size, color: limpiar(it.color, 40) });
  }

  // Mismo criterio que el front: 2 pares = promo 1, 3+ = promo 2, por categoría.
  let sub = 0, desc = 0;
  for (const { p, qty } of detalle) {
    const n = porCat[p.cat];
    let pct = 0;
    catalogo.promos.forEach((pr, idx) => { if (n >= idx + 2) pct = pr.off; });
    sub += p.precio * qty;
    desc += (p.precio * qty * pct) / 100;
  }
  return { detalle, sub, desc: Math.round(desc) };
}

function generarRef() {
  return "BA-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export async function crearPago(request, env) {
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405, { Allow: "POST" });

  let body;
  try { body = await request.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const items = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
  const c = body.cliente || {};
  const cliente = {
    nombre: limpiar(c.nombre, 80), ig: limpiar(c.ig, 60), tel: limpiar(c.tel, 40),
    zona: limpiar(c.zona, 60), dir: limpiar(c.dir, 160), barrio: limpiar(c.barrio, 80), acl: limpiar(c.acl, 300),
  };
  if (!items.length) return json({ error: "El carrito está vacío" }, 400);
  if (!cliente.nombre || !cliente.tel || !cliente.zona || !cliente.dir || !cliente.barrio) {
    return json({ error: "Faltan datos de envío" }, 400);
  }
  const zona = catalogo.zonas.find(z => z.nombre === cliente.zona);
  if (!zona) return json({ error: "Zona de envío inválida" }, 400);

  let totales;
  try { totales = await calcularTotales(env, items); }
  catch (err) { return json({ error: err.message }, 400); }

  const ref = generarRef();
  const factor = totales.sub > 0 ? 1 - totales.desc / totales.sub : 1;
  const mpItems = totales.detalle.map(({ p, qty, size, color }) => ({
    id: p.id,
    title: `${p.nombre}${color ? ` - ${color}` : ""} - Talle ${size}`.slice(0, 250),
    quantity: qty,
    unit_price: Math.round(p.precio * factor * 100) / 100,
    currency_id: "ARS",
  }));
  mpItems.push({ id: "envio", title: `Envío a ${zona.nombre}`, quantity: 1, unit_price: zona.costo, currency_id: "ARS" });

  const origin = new URL(request.url).origin;
  const esHttps = origin.startsWith("https://");

  const preferencia = {
    items: mpItems,
    payer: { name: cliente.nombre, phone: { number: cliente.tel } },
    external_reference: ref,
    back_urls: { success: origin, pending: origin, failure: origin },
    statement_descriptor: (catalogo.marca || "TIENDA").slice(0, 22),
  };
  // Mercado Pago exige https para volver solo y para avisar por webhook
  // (en "wrangler dev" local, con http://localhost, se omiten).
  if (esHttps) {
    preferencia.auto_return = "approved";
    preferencia.notification_url = `${origin}/api/webhook-mp`;
  }

  let resultado;
  try {
    resultado = await mpFetch(env, "/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": ref },
      body: JSON.stringify(preferencia),
    });
  } catch (err) {
    console.error("Error creando preferencia MP:", err.message, JSON.stringify(err.detalle || {}));
    return json({ error: "No pudimos conectar con Mercado Pago. Probá de nuevo en un momento." }, 502);
  }

  // Guardamos el pedido (con la dirección) ANTES de devolver el link de pago, así
  // existe sí o sí antes de que el cliente pague. Si falla, no cortamos la venta.
  try {
    await env.TIENDA.put("pedido:" + ref, JSON.stringify({
      ref,
      cliente,
      items: totales.detalle.map(({ p, qty, size, color }) => ({ nombre: p.nombre, size, color, qty, precio: p.precio })),
      envio: zona.costo,
      subtotal: totales.sub,
      descuento: totales.desc,
      total: totales.sub - totales.desc + zona.costo,
      estado: "pendiente_pago",
      creado: new Date().toISOString(),
    }));
  } catch (err) {
    console.error("No se pudo guardar el pedido en KV:", err);
  }

  return json({ init_point: resultado.init_point, ref });
}
