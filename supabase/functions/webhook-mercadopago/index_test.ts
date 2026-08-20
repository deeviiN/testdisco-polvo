// Teste de integração do webhook do Mercado Pago.
//
// Estratégia: interceptamos `globalThis.fetch` para simular:
//   1. A chamada GET https://api.mercadopago.com/v1/payments/:id (status approved)
//   2. As chamadas REST que o supabase-js faz contra PostgREST/RPC:
//      - SELECT em pagamentos (busca por mp_payment_id)
//      - PATCH em pagamentos (update do status)
//      - POST em rpc/liberar_assinatura
//
// Validamos que:
//   - O update do pagamento é enviado com status=approved e approved_at preenchido
//   - A RPC liberar_assinatura é chamada com o id do pagamento local
//   - O response final tem status=200 e payload { received: true, status: "approved", pagamento_id }

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleWebhook } from "./index.ts";

type FetchCall = { url: string; method: string; body: unknown };

function setEnv(opts: { withSecret?: string } = {}) {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  Deno.env.set("MERCADOPAGO_ACCESS_TOKEN", "mp-token-test");
  if (opts.withSecret) {
    Deno.env.set("MERCADOPAGO_WEBHOOK_SECRET", opts.withSecret);
  } else {
    Deno.env.delete("MERCADOPAGO_WEBHOOK_SECRET");
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function installFetchMock(opts: {
  paymentStatus: string;
  externalRef: string;
  localPagamento: Record<string, unknown> | null;
  rpcShouldFail?: boolean;
}) {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")) ?? "GET";
    let body: unknown = null;
    if (init?.body) {
      try { body = JSON.parse(init.body as string); } catch { body = init.body; }
    }
    calls.push({ url, method, body });

    // 1. Mercado Pago payment lookup
    if (url.startsWith("https://api.mercadopago.com/v1/payments/")) {
      return new Response(JSON.stringify({
        id: 999000111,
        status: opts.paymentStatus,
        external_reference: opts.externalRef,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 2. PostgREST SELECT em pagamentos (filtro mp_payment_id ou mp_external_reference)
    if (url.includes("/rest/v1/pagamentos") && method === "GET") {
      return new Response(JSON.stringify(opts.localPagamento ? [opts.localPagamento] : []), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. PostgREST PATCH em pagamentos (update)
    if (url.includes("/rest/v1/pagamentos") && method === "PATCH") {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 4. RPC liberar_assinatura
    if (url.includes("/rest/v1/rpc/liberar_assinatura")) {
      if (opts.rpcShouldFail) {
        return new Response(JSON.stringify({ message: "boom" }), {
          status: 500, headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "assinatura-id-1", status: "ativo" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not mocked: " + url, { status: 599 });
  }) as typeof fetch;

  return {
    calls,
    restore: () => { globalThis.fetch = original; },
  };
}

Deno.test("webhook MP: status approved libera assinatura e atualiza pagamento", async () => {
  setEnv();

  const localPag = {
    id: "pag-local-1",
    school_id: "school-1",
    user_id: "user-1",
    plano: "mensal",
    valor: 100,
    metodo: "pix",
    status: "pending",
    mp_payment_id: "999000111",
    mp_external_reference: "ext-ref-abc",
    approved_at: null,
  };

  const mock = installFetchMock({
    paymentStatus: "approved",
    externalRef: "ext-ref-abc",
    localPagamento: localPag,
  });

  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=999000111", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: 999000111 }, action: "payment.updated" }),
    });

    const res = await handleWebhook(req);
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.received, true);
    assertEquals(json.status, "approved");
    assertEquals(json.pagamento_id, "pag-local-1");

    // Verifica chamada à API do Mercado Pago
    const mpCall = mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/"));
    assert(mpCall, "Deveria ter chamado a API do Mercado Pago");
    assert(mpCall!.url.endsWith("/v1/payments/999000111"));

    // Verifica que o pagamento foi atualizado para approved com approved_at
    const updateCall = mock.calls.find(
      (c) => c.url.includes("/rest/v1/pagamentos") && c.method === "PATCH",
    );
    assert(updateCall, "Deveria ter feito PATCH em pagamentos");
    const updateBody = updateCall!.body as Record<string, unknown>;
    assertEquals(updateBody.status, "approved");
    assert(typeof updateBody.approved_at === "string" && updateBody.approved_at.length > 0,
      "approved_at deve ser preenchido");

    // Verifica chamada à RPC liberar_assinatura com id correto
    const rpcCall = mock.calls.find((c) => c.url.includes("/rest/v1/rpc/liberar_assinatura"));
    assert(rpcCall, "Deveria ter chamado a RPC liberar_assinatura");
    assertEquals((rpcCall!.body as Record<string, unknown>)._pagamento_id, "pag-local-1");
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: status pending NÃO libera assinatura mas atualiza pagamento", async () => {
  setEnv();

  const localPag = {
    id: "pag-local-2",
    school_id: "school-2",
    user_id: "user-2",
    plano: "mensal",
    valor: 100,
    metodo: "boleto",
    status: "pending",
    mp_payment_id: "999000112",
    mp_external_reference: "ext-ref-xyz",
    approved_at: null,
  };

  const mock = installFetchMock({
    paymentStatus: "pending",
    externalRef: "ext-ref-xyz",
    localPagamento: localPag,
  });

  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=999000112", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: 999000112 } }),
    });

    const res = await handleWebhook(req);
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.status, "pending");

    // PATCH em pagamentos deve ter ocorrido
    const updateCall = mock.calls.find(
      (c) => c.url.includes("/rest/v1/pagamentos") && c.method === "PATCH",
    );
    assert(updateCall);
    assertEquals((updateCall!.body as Record<string, unknown>).status, "pending");

    // RPC liberar_assinatura NÃO deve ter sido chamada
    const rpcCall = mock.calls.find((c) => c.url.includes("/rest/v1/rpc/liberar_assinatura"));
    assertEquals(rpcCall, undefined, "liberar_assinatura não deve ser chamada para status != approved");
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: ignora eventos que não são de pagamento", async () => {
  setEnv();
  const mock = installFetchMock({
    paymentStatus: "approved", externalRef: "x", localPagamento: null,
  });
  try {
    const req = new Request("https://edge.local/webhook?type=merchant_order&id=123", { method: "POST" });
    const res = await handleWebhook(req);
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.ignored, true);
    // Não deve ter chamado a API do MP
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: pagamento local inexistente é ignorado sem erro", async () => {
  setEnv();
  const mock = installFetchMock({
    paymentStatus: "approved",
    externalRef: "no-match",
    localPagamento: null,
  });
  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=42", { method: "POST" });
    const res = await handleWebhook(req);
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.ignored, true);
    assertEquals(json.reason, "no_local_record");

    // Não chama liberar_assinatura
    assertEquals(mock.calls.find((c) => c.url.includes("liberar_assinatura")), undefined);
  } finally {
    mock.restore();
  }
});

// ===================== Validação de payload =====================

Deno.test("webhook MP: rejeita JSON malformado com 400", async () => {
  setEnv();
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 400);
    const json = await res.json();
    assertEquals(json.error, "invalid_json");
    // Não deve ter chamado a API do MP
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: rejeita payload com tipos inválidos com 400", async () => {
  setEnv();
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // data deve ser objeto; aqui mandamos array → falha no schema
      body: JSON.stringify({ type: "payment", data: ["not", "an", "object"] }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 400);
    const json = await res.json();
    assertEquals(json.error, "invalid_payload");
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});

// ===================== Validação de assinatura HMAC v2 =====================

const SECRET = "super-secret-mp";

Deno.test("webhook MP: rejeita 401 quando secret configurado e header x-signature ausente", async () => {
  setEnv({ withSecret: SECRET });
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=42", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: 42 } }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 401);
    const json = await res.json();
    assertEquals(json.error, "invalid_signature");
    assertEquals(json.reason, "missing_signature_headers");
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: rejeita 401 quando assinatura HMAC não bate", async () => {
  setEnv({ withSecret: SECRET });
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=42", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": "ts=1700000000,v1=deadbeef00",
        "x-request-id": "req-1",
      },
      body: JSON.stringify({ type: "payment", data: { id: 42 } }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 401);
    const json = await res.json();
    assertEquals(json.reason, "signature_mismatch");
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: aceita assinatura HMAC válida e processa o evento", async () => {
  setEnv({ withSecret: SECRET });

  const localPag = {
    id: "pag-local-sig",
    school_id: "school-1",
    user_id: "user-1",
    plano: "mensal",
    valor: 100,
    metodo: "pix",
    status: "pending",
    mp_payment_id: "777",
    mp_external_reference: "ref-sig",
    approved_at: null,
  };

  const mock = installFetchMock({
    paymentStatus: "approved",
    externalRef: "ref-sig",
    localPagamento: localPag,
  });

  try {
    const ts = "1700000000";
    const reqId = "req-xyz";
    const dataId = "777";
    const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
    const v1 = await hmacHex(SECRET, manifest);

    const req = new Request(`https://edge.local/webhook?type=payment&data.id=${dataId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": `ts=${ts},v1=${v1}`,
        "x-request-id": reqId,
      },
      body: JSON.stringify({ type: "payment", data: { id: Number(dataId) } }),
    });

    const res = await handleWebhook(req);
    const json = await res.json();
    assertEquals(res.status, 200);
    assertEquals(json.received, true);
    assertEquals(json.status, "approved");
    assertEquals(json.pagamento_id, "pag-local-sig");

    // RPC liberar_assinatura deve ter sido chamada
    const rpcCall = mock.calls.find((c) => c.url.includes("/rest/v1/rpc/liberar_assinatura"));
    assert(rpcCall, "liberar_assinatura deve ser chamada com assinatura válida");
  } finally {
    mock.restore();
  }
});

// ===================== Logs estruturados =====================

function captureLogs() {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const lines: { level: string; raw: string; entry: Record<string, unknown> | null }[] = [];
  const push = (level: string) => (...args: unknown[]) => {
    const raw = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    let entry: Record<string, unknown> | null = null;
    try { entry = JSON.parse(raw); } catch { entry = null; }
    lines.push({ level, raw, entry });
  };
  console.log = push("log");
  console.warn = push("warn");
  console.error = push("error");
  return {
    lines,
    restore: () => { console.log = orig.log; console.warn = orig.warn; console.error = orig.error; },
  };
}

Deno.test("webhook MP: logs estruturados correlacionam pelo x-request-id e expõem reason em 400/401", async () => {
  setEnv({ withSecret: SECRET });

  // 1) Cenário 401: assinatura inválida com x-request-id customizado
  const cap1 = captureLogs();
  const fixedReqId = "corr-id-test-1234";
  try {
    const req = new Request("https://edge.local/webhook?type=payment&data.id=42", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signature": "ts=1700000000,v1=deadbeef",
        "x-request-id": fixedReqId,
      },
      body: JSON.stringify({ type: "payment", data: { id: 42 } }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 401);
    assertEquals(res.headers.get("X-Request-Id"), fixedReqId);

    // Todos os logs devem ser JSON válido e usar o mesmo request_id
    const structured = cap1.lines.filter((l) => l.entry !== null).map((l) => l.entry!);
    assert(structured.length >= 2, "deve haver múltiplos logs estruturados");
    for (const e of structured) {
      assertEquals(e.fn, "webhook-mercadopago");
      assertEquals(e.request_id, fixedReqId);
      assert(typeof e.ts === "string" && (e.ts as string).length > 0);
      assert(typeof e.event === "string");
    }

    const rejected = structured.find((e) => e.event === "signature_rejected");
    assert(rejected, "deve registrar evento signature_rejected");
    assertEquals(rejected!.level, "warn");
    assertEquals(rejected!.status, 401);
    assertEquals(rejected!.reason, "signature_mismatch");
  } finally {
    cap1.restore();
  }

  // 2) Cenário 400: JSON inválido sem x-request-id → request_id é gerado (uuid)
  setEnv(); // sem secret pra isolar
  const cap2 = captureLogs();
  try {
    const req = new Request("https://edge.local/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 400);
    const generatedId = res.headers.get("X-Request-Id");
    assert(generatedId && /^[0-9a-f-]{36}$/i.test(generatedId), "request_id deve ser UUID quando ausente");

    const structured = cap2.lines.filter((l) => l.entry !== null).map((l) => l.entry!);
    const rejected = structured.find((e) => e.event === "payload_rejected");
    assert(rejected, "deve registrar evento payload_rejected");
    assertEquals(rejected!.request_id, generatedId);
    assertEquals(rejected!.reason, "invalid_json");
    assertEquals(rejected!.status, 400);

    // body de resposta também carrega request_id e reason para auditoria
    const json = await res.json();
    assertEquals(json.request_id, generatedId);
    assertEquals(json.reason, "invalid_json");
  } finally {
    cap2.restore();
  }
});

// ===================== Validação de paymentId ausente =====================

Deno.test("webhook MP: retorna 400 quando evento de pagamento não traz data.id (query)", async () => {
  setEnv();
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook?type=payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", action: "payment.updated" }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 400);
    const json = await res.json();
    assertEquals(json.error, "missing_payment_id");
    assertEquals(json.reason, "missing_payment_id");

    const mpCall = mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/"));
    assertEquals(mpCall, undefined, "não deve chamar a API do MP sem data.id");
    const dbCall = mock.calls.find((c) => c.url.includes("/rest/v1/"));
    assertEquals(dbCall, undefined, "não deve consultar o banco sem data.id");
  } finally {
    mock.restore();
  }
});

Deno.test("webhook MP: retorna 400 para evento payment sem data.id mesmo com body presente", async () => {
  setEnv();
  const mock = installFetchMock({ paymentStatus: "approved", externalRef: "x", localPagamento: null });
  try {
    const req = new Request("https://edge.local/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: {} }),
    });
    const res = await handleWebhook(req);
    assertEquals(res.status, 400);
    const json = await res.json();
    assertEquals(json.reason, "missing_payment_id");
    assert(typeof json.request_id === "string" && json.request_id.length > 0);
    assertEquals(mock.calls.find((c) => c.url.startsWith("https://api.mercadopago.com/")), undefined);
  } finally {
    mock.restore();
  }
});
