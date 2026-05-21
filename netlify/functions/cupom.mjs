import { getStore } from "@netlify/blobs";

/**
 * Serve o PDF do cupom publicamente em /cupom/<key>
 * key = numeroPedido + token aleatorio (gerado pelo upload-cupom)
 */
export default async (req) => {
  const url = new URL(req.url);
  // remove qualquer prefixo, mantem so o key
  const key = url.pathname.replace(/^\/cupom\/?/, "").replace(/\/+$/, "");

  if (!key || !/^[A-Z0-9-]{6,40}$/i.test(key)) {
    return new Response("Cupom nao encontrado", { status: 404 });
  }

  try {
    const store = getStore("cupons");
    const blob = await store.get(key, { type: "arrayBuffer" });

    if (!blob) {
      return new Response("Cupom nao encontrado ou expirado", { status: 404 });
    }

    const meta = await store.getMetadata(key);
    const numero = meta?.metadata?.numero || key.split("-")[0];
    const filename = `Cupom-Stylos-${numero}.pdf`;

    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return new Response("Erro ao carregar cupom", { status: 500 });
  }
};

export const config = {
  path: "/cupom/*",
};
