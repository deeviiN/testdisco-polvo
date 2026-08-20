// Lógica de envio isolada para permitir testes automatizados.

export type PushSub = { endpoint: string; p256dh: string; auth: string };

export type SendResult = {
  endpoint: string;
  ok: boolean;
  statusCode?: number;
  removed?: boolean;
  error?: string;
};

export type DeliverDeps = {
  sendNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
  cleanupSubscription: (endpoint: string) => Promise<unknown>;
};

export type DeliverSummary = {
  sent: number;
  failed: number;
  removed: number;
  results: SendResult[];
};

/** Envia o payload para todas as assinaturas, removendo as expiradas (404/410). */
export async function deliverPush(
  subs: PushSub[],
  payload: string,
  deps: DeliverDeps,
): Promise<DeliverSummary> {
  const results: SendResult[] = await Promise.all(
    subs.map(async (s) => {
      try {
        await deps.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        return { endpoint: s.endpoint, ok: true };
      } catch (err: any) {
        const statusCode = err?.statusCode;
        let removed = false;
        if (statusCode === 404 || statusCode === 410) {
          await deps.cleanupSubscription(s.endpoint);
          removed = true;
        }
        return {
          endpoint: s.endpoint,
          ok: false,
          statusCode,
          removed,
          error: String(err?.body || err?.message || err),
        };
      }
    }),
  );

  const sent = results.filter((r) => r.ok).length;
  const removed = results.filter((r) => r.removed).length;
  const failed = results.length - sent - removed;
  return { sent, failed, removed, results };
}
