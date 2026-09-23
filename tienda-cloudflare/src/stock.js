// Stock y productos nuevos del proveedor (nnbotines-backend).
//  - sincronizarStock(): la llama el Cron Trigger cada hora (ver wrangler.jsonc)
//    y guarda el resultado en KV.
//  - servirStock(): GET /api/stock, lo que lee la tienda al cargar. Devuelve lo
//    guardado (rápido). Si no hay nada o está muy viejo, consulta al proveedor.
//
// Emparejamiento: el proveedor no comparte códigos con tus productos, pero SÍ
// usa las mismas fotos → se empareja por URL de foto.

import catalogo from "./catalogo.json";

const URL_PROVEEDOR = "https://nnbotines-backend.vercel.app/api/products";
const KEY = "stock:actual";
const MAX_ANTIGUEDAD_MS = 3 * 60 * 60 * 1000; // respaldo si el cron falla
const MARGEN = 1.20;      // costo del proveedor + 20%
const REDONDEO = 1000;    // al millar más cercano

const precioVenta = costo => Math.round((costo * MARGEN) / REDONDEO) * REDONDEO;
const limpiarNombre = n => n.replace(/\s+/g, " ").trim();
function categoriaPorNombre(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes("sintetico") || n.includes("sintético")) return "Sintético";
  if (n.includes("gato") || n.includes("sala") || n.includes("futsal") || n.includes("papi")) return "Papi / Futsal";
  return "Campo (FG)";
}

async function consultarProveedor() {
  const r = await fetch(URL_PROVEEDOR, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`El proveedor respondió ${r.status}`);
  const productosProveedor = await r.json();

  const fotosPropias = new Set();
  for (const p of catalogo.productos) {
    if (p.img) fotosPropias.add(p.img);
    (p.colores || []).forEach(c => { if (c.img) fotosPropias.add(c.img); });
  }

  const porImagen = {};
  const nuevos = [];
  let productosLeidos = 0;
  for (const p of productosProveedor) {
    const img = Array.isArray(p.imagen) ? p.imagen[0] : p.imagen;
    if (!img || !Array.isArray(p.size)) continue;
    productosLeidos++;
    const entry = porImagen[img] || (porImagen[img] = {});
    const talles = [];
    for (const s of p.size) {
      if (typeof s.talle !== "number") continue;
      // misma foto repetida: nos quedamos con el stock más alto (menos falsos "agotado")
      entry[s.talle] = Math.max(entry[s.talle] || 0, Number(s.stock) || 0);
      talles.push(s.talle);
    }
    if (!fotosPropias.has(img)) {
      const nombre = limpiarNombre(p.nombre || "Botín");
      nuevos.push({
        id: "auto-" + String(p._id || img).slice(-8),
        nombre,
        cat: categoriaPorNombre(nombre),
        precio: precioVenta(Number(p.precio) || 0),
        img, top: false, nuevo: true,
        talles: [...new Set(talles)].sort((a, b) => a - b),
        sinStock: p.size.filter(s => !(Number(s.stock) > 0)).map(s => s.talle),
      });
    }
  }
  return { porImagen, nuevos, actualizado: new Date().toISOString(), productosLeidos };
}

export async function sincronizarStock(env) {
  try {
    const datos = await consultarProveedor();
    await env.TIENDA.put(KEY, JSON.stringify(datos));
    console.log(`Stock sincronizado: ${datos.productosLeidos} productos, ${datos.nuevos.length} nuevo(s).`);
    return datos;
  } catch (err) {
    // Si el proveedor está caído, la tienda sigue con el último stock guardado.
    console.error("Error sincronizando stock del proveedor:", err);
    return null;
  }
}

export async function servirStock(request, env, ctx) {
  const cabeceras = { "Cache-Control": "public, max-age=300" };
  const respuesta = datos => new Response(JSON.stringify(datos), {
    headers: { "Content-Type": "application/json; charset=utf-8", ...cabeceras },
  });

  try {
    const guardado = await env.TIENDA.get(KEY, "json");
    if (guardado) {
      const edad = Date.now() - new Date(guardado.actualizado).getTime();
      if (edad > MAX_ANTIGUEDAD_MS) ctx.waitUntil(sincronizarStock(env)); // refresca en segundo plano
      return respuesta(guardado);
    }
    // Primera vez (recién desplegado): consultamos ahora mismo.
    const fresco = await sincronizarStock(env);
    if (fresco) return respuesta(fresco);
  } catch (err) {
    console.error("Error sirviendo stock:", err);
  }
  // Si todo falla, mapa vacío: la tienda sigue con el stock que trae de fábrica.
  return new Response(JSON.stringify({ porImagen: {}, nuevos: [], actualizado: null }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
