import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";

import { PageShell } from "../components/ui/PageShell";
import { clearStoredProfileSession } from "../features/lobby/flow/identityStorage";
import { apiRequest, clearSessionId } from "../services/http";
import { AppRouteRecovery } from "./AppRouteRecovery";


type BrandShellContent = {
  kind: "brand";
  eyebrow: string;
  subtitle: string;
};

type TaskShellContent = {
  kind: "task";
  description: string;
  eyebrow: string;
  title: string;
};

function useShellContent(): BrandShellContent | TaskShellContent {
  const { t } = useTranslation("pages");
  const { pathname } = useLocation();

  return useMemo(() => {
    if (pathname === "/") {
      return {
        kind: "brand",
        eyebrow: t("appShell.home.eyebrow"),
        subtitle: t("appShell.home.subtitle"),
      };
    }

    if (pathname.startsWith("/lobby")) {
      return {
        kind: "brand",
        eyebrow: t("appShell.lobby.eyebrow"),
        subtitle: t("appShell.lobby.subtitle"),
      };
    }

    if (pathname.startsWith("/room/")) {
      return {
        kind: "task",
        description: t("appShell.room.description"),
        eyebrow: t("appShell.room.eyebrow"),
        title: t("appShell.room.title"),
      };
    }

    if (pathname.startsWith("/game/")) {
      return {
        kind: "task",
        description: t("appShell.game.description"),
        eyebrow: t("appShell.game.eyebrow"),
        title: t("appShell.game.title"),
      };
    }

    if (pathname.startsWith("/settlement/")) {
      return {
        kind: "task",
        description: t("appShell.settlement.description"),
        eyebrow: t("appShell.settlement.eyebrow"),
        title: t("appShell.settlement.title"),
      };
    }

    if (pathname.startsWith("/design/decision-card-demo")) {
      return {
        kind: "task",
        description: t("appShell.design.description"),
        eyebrow: t("appShell.design.eyebrow"),
        title: t("appShell.design.title"),
      };
    }

    return {
      kind: "brand",
      eyebrow: t("appShell.fallback.eyebrow"),
      subtitle: t("appShell.fallback.subtitle"),
    };
  }, [pathname, t]);
}

function resolveRoomCode(pathname: string): string | null {
  const match = /^\/room\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AppShell() {
  const { t } = useTranslation("pages");
  const location = useLocation();
  const shellContent = useShellContent();
  const currentRoomCode = resolveRoomCode(location.pathname);
  const isLobbyRoute = location.pathname.startsWith("/lobby");
  const isWorkbenchRoute =
    location.pathname.startsWith("/room/")
    || location.pathname.startsWith("/game/")
    || location.pathname.startsWith("/settlement/")
    || location.pathname.startsWith("/design/decision-card-demo");
  const shellWidth = isWorkbenchRoute || isLobbyRoute ? "workbench" : "wide";

  async function handleReturnToLobby(): Promise<void> {
    if (!currentRoomCode) {
      return;
    }

    try {
      await apiRequest(`/api/v1/rooms/${currentRoomCode}/leave`, {
        method: "POST",
      });
      clearSessionId();
      clearStoredProfileSession();
    } catch {
      // The lobby can still recover or clear stale sessions if the leave request races a disconnect.
    }
  }

  return (
    <div className="app-shell">
      <AppRouteRecovery />
      <PageShell className="app-shell__layout" width={shellWidth}>
        {shellContent.kind === "brand" && !isLobbyRoute ? (
          <header className="app-shell__header app-shell__header--brand">
            <div className="app-shell__intro">
              <p className="app-shell__eyebrow">{shellContent.eyebrow}</p>
              <h1>Tomorrow Question</h1>
              <p className="app-shell__subtitle">{shellContent.subtitle}</p>
            </div>
          </header>
        ) : shellContent.kind === "task" && !isWorkbenchRoute ? (
          <header className="panel app-shell__task-header">
            <div className="app-shell__task-meta">
              <p className="panel__eyebrow">{shellContent.eyebrow}</p>
              <h1 className="app-shell__task-title">{shellContent.title}</h1>
              <p className="app-shell__task-description">{shellContent.description}</p>
            </div>
            <Link
              className="ui-button ui-button--secondary app-shell__task-back"
              onClick={() => {
                void handleReturnToLobby();
              }}
              to="/lobby"
            >
              {t("appShell.backToLobby")}
            </Link>
          </header>
        ) : null}

        <main className="app-shell__content">
          <Outlet />
        </main>
      </PageShell>
    </div>
  );
}
