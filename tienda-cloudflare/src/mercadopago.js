// Mercado Pago por API REST directa (fetch). No usamos el SDK "mercadopago"
// de npm porque está pensado para Node y no hace falta en Cloudflare Workers.

import { REF_VALIDA } from "./util.js";

const API = "https://api.mercadopago.com";

export async function mpFetch(env, path, options = {}) {
  if (!env.MP_ACCESS_TOKEN) {
    const e = new Error("Falta la variable MP_ACCESS_TOKEN");
    e.status = 500;
    throw e;
  }
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const texto = await res.text();
  let data;
  try { data = JSON.parse(texto); } catch { data = { raw: texto.slice(0, 500) }; }
  if (!res.ok) {
    const e = new Error(`Mercado Pago respondió ${res.status}`);
    e.status = res.status;
    e.detalle = data;
    throw e;
  }
  return data;
}

export const obtenerPago = (env, id) => mpFetch(env, `/v1/payments/${id}`);

// Guarda en el pedido el resultado real del pago (lo usan estado-pago y el webhook).
export async function registrarPagoEnPedido(env, pago) {
  const ref = pago.external_reference || "";
  if (!REF_VALIDA.test(ref)) return;
  const key = "pedido:" + ref;
  const pedido = await env.TIENDA.get(key, "json");
  if (!pedido) return;

  const paymentId = String(pago.id);
  // Si ya está aprobado, un intento posterior fallido (otro pago) no lo pisa.
  if (pedido.estado === "approved" && pago.status !== "approved" && pedido.paymentId && pedido.paymentId !== paymentId) return;
  // Sin cambios: nos ahorramos una escritura.
  if (pedido.estado === pago.status && pedido.paymentId === paymentId) return;

  pedido.estado = pago.status;       // approved | pending | in_process | rejected | refunded ...
  pedido.paymentId = paymentId;
  pedido.actualizado = new Date().toISOString();
  await env.TIENDA.put(key, JSON.stringify(pedido));
}
