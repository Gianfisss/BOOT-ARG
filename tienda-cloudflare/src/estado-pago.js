// GET /api/estado-pago?payment_id=123
// No confiamos en el "status" de la URL (lo escribe cualquiera): le preguntamos
// a Mercado Pago por ese ID y devolvemos lo que ÉL diga.

import { obtenerPago, registrarPagoEnPedido } from "./mercadopago.js";
import { json } from "./util.js";

export async function estadoPago(request, env) {
  const paymentId = new URL(request.url).searchParams.get("payment_id") || "";
  if (!/^\d{5,20}$/.test(paymentId)) return json({ error: "payment_id inválido" }, 400);

  try {
    const pago = await obtenerPago(env, paymentId);
    try { await registrarPagoEnPedido(env, pago); }
    catch (err) { console.error("No se pudo actualizar el pedido en KV:", err); }

    return json({
      status: pago.status,
      status_detail: pago.status_detail,
      ref: pago.external_reference || "",
      monto: pago.transaction_amount,
    });
  } catch (err) {
    console.error("Error consultando pago MP:", err.message, JSON.stringify(err.detalle || {}));
    return json({ error: "No pudimos consultar el pago" }, 502);
  }
}
