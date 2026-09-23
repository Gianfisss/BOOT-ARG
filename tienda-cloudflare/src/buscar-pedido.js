// GET /api/buscar-pedido?ref=BA-XXXX&clave=...
// Usado por pedidos.html: devuelve el pedido guardado (datos de envío + productos).

import { json, iguales, REF_VALIDA } from "./util.js";

export async function buscarPedido(request, env) {
  const params = new URL(request.url).searchParams;
  const ref = (params.get("ref") || "").trim().toUpperCase();
  const clave = params.get("clave") || "";

  // Si configuraste PEDIDOS_CLAVE, exigimos que coincida (muy recomendado).
  if (env.PEDIDOS_CLAVE && !iguales(clave, env.PEDIDOS_CLAVE)) {
    return json({ error: "Clave incorrecta" }, 401);
  }
  if (!REF_VALIDA.test(ref)) return json({ error: "Código de referencia inválido" }, 400);

  try {
    const pedido = await env.TIENDA.get("pedido:" + ref, "json");
    if (!pedido) return json({ error: "No encontramos ningún pedido con ese código" }, 404);
    return json(pedido);
  } catch (err) {
    console.error("Error buscando pedido:", err);
    return json({ error: "No pudimos buscar el pedido, probá de nuevo" }, 502);
  }
}
