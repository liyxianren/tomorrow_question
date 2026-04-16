import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  isRecoveredRouteSatisfied,
  resolveSessionRoute,
  restoreSessionContext,
} from "./sessionRecovery";


export function AppRouteRecovery() {
  const location = useLocation();
  const navigate = useNavigate();
  const isRecoveringRef = useRef(false);

  useEffect(() => {
    const shouldRecover = location.pathname === "/";

    if (!shouldRecover || isRecoveringRef.current) {
      return;
    }

    let cancelled = false;
    isRecoveringRef.current = true;

    async function recoverRoute(): Promise<void> {
      try {
        const restored = await restoreSessionContext();
        if (!restored || cancelled) {
          return;
        }

        const target = resolveSessionRoute(restored);
        if (isRecoveredRouteSatisfied(location.pathname, target.path)) {
          return;
        }

        navigate(target.path, {
          replace: true,
          state: target.state,
        });
      } catch {
        return;
      } finally {
        if (!cancelled) {
          isRecoveringRef.current = false;
        }
      }
    }

    void recoverRoute();

    return () => {
      cancelled = true;
      isRecoveringRef.current = false;
    };
  }, [location.pathname, navigate]);

  return null;
}
