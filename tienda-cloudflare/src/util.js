// Helpers compartidos.

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

// Texto que viene del navegador: lo pasamos a string, sacamos < > y lo acotamos.
export function limpiar(valor, max = 200) {
  return String(valor ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

// Comparación de textos en tiempo constante (para la clave de pedidos.html).
export function iguales(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const REF_VALIDA = /^BA-[A-Z0-9]{4,24}$/;
