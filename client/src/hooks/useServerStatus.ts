import { useCallback, useEffect, useRef, useState } from "react";
import { healthCheck } from "../api/client.ts";
import type { HealthData } from "../types/api.ts";

type Status = "checking" | "online" | "offline";

export function useServerStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [info, setInfo] = useState<HealthData | null>(null);
  const prevStatusRef = useRef<Status>("checking");
  const instanceIdRef = useRef<string | null>(null);

  const applyStatus = useCallback((nextStatus: Status, nextInfo: HealthData | null) => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = nextStatus;
    setStatus(nextStatus);
    if (nextInfo) setInfo(nextInfo);

    if (nextStatus === "offline" && prevStatus !== "offline") {
      window.dispatchEvent(new CustomEvent("sgf:server-offline"));
    }
    if (nextStatus === "online" && prevStatus !== "online") {
      window.dispatchEvent(new CustomEvent("sgf:server-online"));
    }
  }, []);

  const check = useCallback(async (silent = false) => {
    if (!silent && prevStatusRef.current === "checking") setStatus("checking");

    const response = await healthCheck();
    if (response.success && response.data) {
      const nextInfo = response.data as HealthData;
      if (instanceIdRef.current && nextInfo.instanceId && instanceIdRef.current !== nextInfo.instanceId) {
        window.dispatchEvent(
          new CustomEvent("sgf:server-restarted", {
            detail: { previous: instanceIdRef.current, current: nextInfo.instanceId },
          }),
        );
      }
      instanceIdRef.current = nextInfo.instanceId || instanceIdRef.current;
      applyStatus("online", nextInfo);
      return;
    }

    applyStatus("offline", info);
  }, [applyStatus, info]);

  useEffect(() => {
    void check(false);
    const intervalId = window.setInterval(() => void check(true), 5000);
    const onFocus = () => void check(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  return { status, info, recheck: () => void check(false) };
}
