import { useCallback, useEffect, useState } from "react";

const KEY = "inbox-alerts-enabled";
const EVT = "inbox-alerts-changed";

export function getInboxAlertsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === "1";
}

export function useInboxAlerts() {
  const [enabled, setEnabledState] = useState<boolean>(() => getInboxAlertsEnabled());

  useEffect(() => {
    const onChange = () => setEnabledState(getInboxAlertsEnabled());
    window.addEventListener(EVT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    window.localStorage.setItem(KEY, v ? "1" : "0");
    window.dispatchEvent(new Event(EVT));
    setEnabledState(v);
  }, []);

  return { enabled, setEnabled };
}
