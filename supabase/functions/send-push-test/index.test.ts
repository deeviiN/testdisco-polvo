import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliverPush, type PushSub } from "./delivery.ts";

const sub = (n: string): PushSub => ({ endpoint: `https://push.example/${n}`, p256dh: "k", auth: "a" });

function httpError(statusCode: number, body = "gone") {
  const e: any = new Error(`push error ${statusCode}`);
  e.statusCode = statusCode;
  e.body = body;
  return e;
}

Deno.test("envia para assinaturas válidas", async () => {
  const cleaned: string[] = [];
  const res = await deliverPush([sub("a"), sub("b")], "{}", {
    sendNotification: () => Promise.resolve(),
    cleanupSubscription: (e) => (cleaned.push(e), Promise.resolve()),
  });

  assertEquals(res.sent, 2);
  assertEquals(res.failed, 0);
  assertEquals(res.removed, 0);
  assertEquals(cleaned, []);
});

Deno.test("remove assinaturas expiradas (410) sem contar como erro", async () => {
  const cleaned: string[] = [];
  const res = await deliverPush([sub("ok"), sub("gone")], "{}", {
    sendNotification: (s) =>
      s.endpoint.endsWith("gone") ? Promise.reject(httpError(410)) : Promise.resolve(),
    cleanupSubscription: (e) => (cleaned.push(e), Promise.resolve()),
  });

  assertEquals(res.sent, 1);
  assertEquals(res.removed, 1);
  assertEquals(res.failed, 0);
  assertEquals(cleaned, ["https://push.example/gone"]);
  assertEquals(res.results.find((r) => r.endpoint.endsWith("gone"))?.removed, true);
});

Deno.test("assinatura inexistente (404) também é removida", async () => {
  const cleaned: string[] = [];
  const res = await deliverPush([sub("x")], "{}", {
    sendNotification: () => Promise.reject(httpError(404, "not found")),
    cleanupSubscription: (e) => (cleaned.push(e), Promise.resolve()),
  });

  assertEquals(res.removed, 1);
  assertEquals(res.failed, 0);
  assertEquals(cleaned.length, 1);
});

Deno.test("falha real (500) conta como erro e não remove", async () => {
  const cleaned: string[] = [];
  const res = await deliverPush([sub("y")], "{}", {
    sendNotification: () => Promise.reject(httpError(500, "server error")),
    cleanupSubscription: (e) => (cleaned.push(e), Promise.resolve()),
  });

  assertEquals(res.sent, 0);
  assertEquals(res.removed, 0);
  assertEquals(res.failed, 1);
  assertEquals(res.results[0].statusCode, 500);
  assertEquals(cleaned, []);
});

Deno.test("lista vazia retorna resumo zerado", async () => {
  const res = await deliverPush([], "{}", {
    sendNotification: () => Promise.resolve(),
    cleanupSubscription: () => Promise.resolve(),
  });
  assertEquals(res, { sent: 0, failed: 0, removed: 0, results: [] });
});
