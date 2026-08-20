import { describe, it, expect, beforeEach } from "vitest";
import {
  getLastUpdateLocation,
  setLastUpdateLocation,
  LAST_UPDATE_LOCATION_EVENT,
  type LastUpdateLocation,
} from "@/lib/lastUpdatePreference";

describe("lastUpdatePreference - persistência no localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("retorna 'home' como valor padrão quando nada foi salvo", () => {
    expect(getLastUpdateLocation()).toBe("home");
  });

  it.each<LastUpdateLocation>(["off", "header", "footer", "version_card", "home"])(
    "persiste a escolha '%s' no localStorage",
    (value) => {
      setLastUpdateLocation(value);
      expect(localStorage.getItem("sala-vida:last-update-location")).toBe(value);
    },
  );

  it("recupera a escolha salva ao 'recarregar a página' (nova leitura)", () => {
    setLastUpdateLocation("footer");
    // Simula reload: nova chamada de leitura sem estado em memória
    expect(getLastUpdateLocation()).toBe("footer");

    setLastUpdateLocation("version_card");
    expect(getLastUpdateLocation()).toBe("version_card");
  });

  it("ignora valores inválidos no localStorage e cai no padrão 'home'", () => {
    localStorage.setItem("sala-vida:last-update-location", "invalido");
    expect(getLastUpdateLocation()).toBe("home");
  });

  it("dispara evento customizado ao salvar a preferência", () => {
    let fired = 0;
    const handler = () => {
      fired += 1;
    };
    window.addEventListener(LAST_UPDATE_LOCATION_EVENT, handler);
    setLastUpdateLocation("header");
    setLastUpdateLocation("off");
    window.removeEventListener(LAST_UPDATE_LOCATION_EVENT, handler);
    expect(fired).toBe(2);
  });
});
