import { getStore } from "@netlify/blobs";

/**
 * Recebe o PDF do cupom + numero do pedido do site (multipart/form-data),
 * salva no Netlify Blobs e retorna a URL publica pra incluir no WhatsApp.
 *
 * URL final: https://stylos-piscinas.netlify.app/cupom/<numero>-<token>
 */
export default async (req) => {
  // CORS basico (mesmo dominio, mas seguro deixar explicito)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("pdf");
    const numero = formData.get("numero");

    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ erro: "PDF nao enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!numero) {
      return new Response(JSON.stringify({ erro: "numero do pedido obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validacoes basicas de seguranca
    const numeroLimpo = String(numero).replace(/[^A-Z0-9-]/gi, "").slice(0, 20);
    if (!numeroLimpo) {
      return new Response(JSON.stringify({ erro: "numero invalido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buffer = await file.arrayBuffer();
    // Limite 5MB pra evitar abuse (cupom 80mm tipico = 30-150KB)
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ erro: "PDF muito grande" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Token aleatorio = URL nao-adivinhavel (LGPD: cupom contem PII do cliente)
    const token = Math.random().toString(36).slice(2, 10);
    const key = `${numeroLimpo}-${token}`;

    const store = getStore("cupons");
    await store.set(key, buffer, {
      metadata: {
        contentType: "application/pdf",
        numero: numeroLimpo,
        createdAt: new Date().toISOString(),
        sizeBytes: buffer.byteLength,
      },
    });

    const origin = new URL(req.url).origin;
    const publicUrl = `${origin}/cupom/${key}`;

    return new Response(JSON.stringify({ url: publicUrl, key }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ erro: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

export const config = {
  path: "/api/upload-cupom",
};
