import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminRouteGuard from "../AdminRouteGuard";

const authState: { user: any; loading: boolean } = { user: null, loading: false };
const rpcMock = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/login"
          element={
            <AdminRouteGuard>
              <div>LOGIN_PAGE</div>
            </AdminRouteGuard>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminRouteGuard>
              <div>ADMIN_OK</div>
            </AdminRouteGuard>
          }
        />
        <Route path="/home" element={<div>HOME_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("AdminRouteGuard", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    authState.user = null;
    authState.loading = false;
  });

  it("permite acesso quando has_role('admin') retorna true", async () => {
    authState.user = { id: "u-admin" };
    rpcMock.mockResolvedValue({ data: true, error: null });
    renderAt("/admin/console");
    await waitFor(() => expect(screen.getByText("ADMIN_OK")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith("has_role", {
      _user_id: "u-admin",
      _role: "admin",
    });
  });

  it("redireciona usuário comum (has_role=false) para /home", async () => {
    authState.user = { id: "u-comum" };
    rpcMock.mockResolvedValue({ data: false, error: null });
    renderAt("/admin/console");
    await waitFor(() => expect(screen.getByText("HOME_PAGE")).toBeInTheDocument());
    expect(screen.queryByText("ADMIN_OK")).not.toBeInTheDocument();
  });

  it("redireciona gestor (has_role admin=false) para /home, mesmo autenticado", async () => {
    authState.user = { id: "u-gestor" };
    rpcMock.mockResolvedValue({ data: false, error: null });
    renderAt("/admin/console/school/abc");
    await waitFor(() => expect(screen.getByText("HOME_PAGE")).toBeInTheDocument());
  });

  it("redireciona não autenticado para /admin/login", async () => {
    authState.user = null;
    renderAt("/admin/console");
    await waitFor(() => expect(screen.getByText("LOGIN_PAGE")).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("trata erro do RPC como negação de acesso", async () => {
    authState.user = { id: "u-x" };
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderAt("/admin/console");
    await waitFor(() => expect(screen.getByText("HOME_PAGE")).toBeInTheDocument());
  });

  it("libera rotas públicas (/admin/login) sem chamar has_role", async () => {
    authState.user = null;
    renderAt("/admin/login");
    await waitFor(() => expect(screen.getByText("LOGIN_PAGE")).toBeInTheDocument());
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
