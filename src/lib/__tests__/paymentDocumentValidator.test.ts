import { describe, it, expect, vi } from "vitest";
import {
  validatePaymentDocument,
  PaymentDocumentValidationError,
  PAID_STATUSES,
} from "../paymentDocumentValidator";

const baseRow = {
  id: "p1",
  school_id: "s1",
  plano: "mensal",
  valor: 129.9,
  metodo: "pix",
  status: "approved",
  ticket_url: null,
  qr_code: "00020126...",
  qr_code_base64: null,
  created_at: "2026-01-01T00:00:00Z",
  approved_at: "2026-01-02T00:00:00Z",
};

describe("validatePaymentDocument", () => {
  it("normaliza PIX pago", () => {
    const v = validatePaymentDocument(baseRow, { viewer: "admin" })!;
    expect(v.kind).toBe("pix");
    expect(v.paid).toBe(true);
    expect(v.pixCode).toBe(baseRow.qr_code);
  });

  it("normaliza Boleto pendente com ticket_url", () => {
    const v = validatePaymentDocument(
      { ...baseRow, metodo: "boleto", qr_code: null, qr_code_base64: null, ticket_url: "https://x", status: "pending" },
      { viewer: "gestor" },
    )!;
    expect(v.kind).toBe("boleto");
    expect(v.paid).toBe(false);
    expect(v.url).toBe("https://x");
  });

  it("rejeita linha com signer_role (campo de signed_contracts)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v = validatePaymentDocument({ ...baseRow, signer_role: "admin" } as any, { viewer: "admin" });
    expect(v).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("rejeita linha com bucket/path (não deve existir em pagamentos)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v = validatePaymentDocument({ ...baseRow, bucket: "x", path: "y" } as any, { viewer: "gestor" });
    expect(v).toBeNull();
    warn.mockRestore();
  });

  it("rejeita PIX sem qr_code nem ticket_url", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v = validatePaymentDocument(
      { ...baseRow, qr_code: null, qr_code_base64: null, ticket_url: null },
      { viewer: "admin" },
    );
    expect(v).toBeNull();
    warn.mockRestore();
  });

  it("rejeita Boleto sem ticket_url", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v = validatePaymentDocument(
      { ...baseRow, metodo: "boleto", qr_code: null, qr_code_base64: null, ticket_url: null },
      { viewer: "admin" },
    );
    expect(v).toBeNull();
    warn.mockRestore();
  });

  it("rejeita status fora da lista canônica", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const v = validatePaymentDocument({ ...baseRow, status: "weird_state" }, { viewer: "admin" });
    expect(v).toBeNull();
    warn.mockRestore();
  });

  it("modo throw lança PaymentDocumentValidationError com issues", () => {
    expect(() =>
      validatePaymentDocument({ ...baseRow, signer_role: "admin" } as any, { viewer: "admin", mode: "throw" }),
    ).toThrow(PaymentDocumentValidationError);
  });

  it("admin e gestor classificam o MESMO row de forma idêntica", () => {
    const a = validatePaymentDocument(baseRow, { viewer: "admin" });
    const g = validatePaymentDocument(baseRow, { viewer: "gestor" });
    expect(a).toEqual(g);
  });

  it("PAID_STATUSES contém termos esperados", () => {
    for (const s of ["approved", "paid", "pago", "aprovado", "completed", "succeeded"]) {
      expect(PAID_STATUSES.has(s)).toBe(true);
    }
  });
});
