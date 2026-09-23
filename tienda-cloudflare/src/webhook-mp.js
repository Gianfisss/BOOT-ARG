// POST /api/webhook-mp
// Mercado Pago avisa acá cada vez que un pago cambia de estado, AUNQUE el cliente
// cierre el navegador antes de volver a la tienda. Así el pedido queda como
// "Pagado" sí o sí. No confiamos en lo que llega: con el ID le volvemos a
// preguntar a Mercado Pago y guardamos SU respuesta.

import { obtenerPago, registrarPagoEnPedido } from "./mercadopago.js";

const ok = () => new Response("ok", { status: 200 });

export async function webhookMP(request, env) {
  const url = new URL(request.url);
  let body = {};
  try { body = await request.json(); } catch { /* algunas notificaciones vienen sin body */ }

  const tipo = url.searchParams.get("type") || url.searchParams.get("topic") || body.type || body.topic || "";
  const id = String(
    url.searchParams.get("data.id") || (body.data && body.data.id) ||
    (tipo === "payment" ? url.searchParams.get("id") : "") || ""
  );

  if (tipo !== "payment" || !/^\d{5,20}$/.test(id)) return ok(); // otros avisos (merchant_order, etc.)

  try {
    const pago = await obtenerPago(env, id);
    await registrarPagoEnPedido(env, pago);
    return ok();
  } catch (err) {
    console.error("Webhook MP:", err.message, JSON.stringify(err.detalle || {}));
    if (err.status === 404) return ok();               // pago de prueba/inexistente: no reintentar
    return new Response("error", { status: 500 });     // Mercado Pago reintenta solo
  }
}
