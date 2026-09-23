// Genera src/catalogo.json a partir del CONFIG que está en public/index.html.
// Se ejecuta solo (no en el navegador). Correlo cada vez que cambies precios/productos/zonas/envío:
//   npm run catalogo
const fs = require("fs");
const path = require("path");
const raiz = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "public", "index.html"), "utf8");

const marcaInicio = "const CONFIG = {";
const marcaFin = "/* ================= FIN DE LA CONFIGURACIÓN ================= */";
const i = html.indexOf(marcaInicio);
const f = html.indexOf(marcaFin);
if (i === -1 || f === -1) throw new Error("No encontré el bloque CONFIG en index.html (¿cambiaste los comentarios?)");

let src = html.slice(i + "const CONFIG = ".length, f);
src = src.slice(0, src.lastIndexOf(";"));
const CONFIG = eval("(" + src + ")");

const catalogo = {
  marca: (CONFIG.marca || "") + (CONFIG.marcaAccento || ""),
  moneda: CONFIG.moneda,
  productos: CONFIG.productos,
  zonas: CONFIG.zonas,
  promos: CONFIG.promos
};

const outDir = path.join(raiz, "src");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "catalogo.json"), JSON.stringify(catalogo, null, 2));
console.log(`✅ Catálogo generado: ${catalogo.productos.length} productos, ${catalogo.zonas.length} zonas, ${catalogo.promos.length} promos.`);
