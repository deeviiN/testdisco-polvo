/**
 * Garante que GestorDocumentos:
 *  - Filtra registros fantasma (file_path iniciando com "__request__" ou file_name === "__request__").
 *  - Para contratos válidos, abre via signed URL no bucket "signed-contracts" usando c.file_path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { createSignedUrl, storageFrom } = vi.hoisted(() => {
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: "https://example.com/signed.pdf" },
    error: null,
  });
  const storageFrom = vi.fn().mockReturnValue({ createSignedUrl });
  return { createSignedUrl, storageFrom };
});

const SCHOOL_ID = "school-1";
const USER_ID = "user-1";

const { contracts } = vi.hoisted(() => ({ contracts: [
  // Fantasma — deve ser ignorado
  {
    id: "ghost-1",
    file_path: "__request__/abc",
    file_name: "__request__",
    uploaded_at: "2026-06-01T10:00:00Z",
    signer_role: "gestor",
    status: "awaiting_admin",
  },
  // Real
  {
    id: "real-1",
    file_path: "school-1/admin/uid/123-contrato.pdf",
    file_name: "contrato.pdf",
    uploaded_at: "2026-06-02T10:00:00Z",
    signer_role: "admin",
    status: "awaiting_gestor",
  },
]}));

function buildBuilder(rows: any[]) {
  const result = Promise.resolve({ data: rows, error: null });
  const b: any = {
    select: () => b,
    eq: () => b,
    neq: () => b,
    gt: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (onF: any, onR: any) => result.then(onF, onR),
    catch: (onR: any) => result.catch(onR),
    finally: (cb: any) => result.finally(cb),
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "signed_contracts") return buildBuilder(contracts);
      return buildBuilder([]);
    }),
    storage: { from: storageFrom },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

const { AUTH } = vi.hoisted(() => ({
  AUTH: { user: { id: "user-1" }, profile: { school_id: "school-1" } },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => AUTH,
}));

vi.mock("@/components/PaymentValidationLog", () => ({
  PaymentValidationLog: () => null,
}));

vi.mock("@/lib/paymentDocumentValidator", () => ({
  validatePaymentBatch: () => ({ docs: [], discards: [] }),
}));

const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

beforeEach(() => {
  openSpy.mockClear();
  createSignedUrl.mockClear();
  storageFrom.mockClear();
});

import GestorDocumentos from "../GestorDocumentos";

describe("GestorDocumentos — download de contrato sem fantasma", () => {
  it("ignora registros __request__ e baixa apenas o PDF real via signed URL", async () => {
    render(
      <MemoryRouter>
        <GestorDocumentos />
      </MemoryRouter>,
    );

    // Aguarda render da pasta Contratos com badge "1" (somente o real)
    const contratosBtn = await screen.findByRole("button", { name: /Contratos/i });
    fireEvent.click(contratosBtn);

    // O item fantasma não deve aparecer
    expect(screen.queryByText("__request__")).toBeNull();

    const item = await screen.findByText("contrato.pdf");
    fireEvent.click(item);

    await waitFor(() => {
      expect(storageFrom).toHaveBeenCalledWith("signed-contracts");
      expect(createSignedUrl).toHaveBeenCalledWith(
        `${SCHOOL_ID}/admin/uid/123-contrato.pdf`,
        300,
      );
      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com/signed.pdf",
        "_blank",
        "noopener",
      );
    });
  });
});
