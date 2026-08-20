import { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * useSmartBack
 * Returns a function that navigates back intelligently:
 *  - If there is real browser history within the app, go back one step.
 *  - Otherwise fall back to a sensible default route (param `fallback`, default "/sectors").
 *  - Never lands on the same page (avoids loops).
 *  - Special-cases auth/welcome to land on "/sectors" or "/" instead of going outside the app.
 */
export function useSmartBack(fallback: string = "/sectors") {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const path = location.pathname;

    // From auth/welcome go to home rather than back outside the app.
    if (path === "/" || path === "/auth" || path === "/reset-password") {
      navigate("/sectors");
      return;
    }

    const hasHistory =
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      // If user opened deep-link directly, history.length can still be >1 due to redirects.
      // Use a referrer-or-state heuristic: only "go back" if the previous entry is same-origin.
      (document.referrer === "" || document.referrer.startsWith(window.location.origin));

    if (hasHistory) {
      navigate(-1);
      // Safety: if after a tick we are still on the same path, force fallback.
      setTimeout(() => {
        if (window.location.pathname === path) {
          navigate(fallback, { replace: true });
        }
      }, 120);
      return;
    }

    navigate(fallback, { replace: true });
  }, [navigate, location.pathname, fallback]);
}
