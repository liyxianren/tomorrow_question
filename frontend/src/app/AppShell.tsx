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

function resolveShellContent(pathname: string): BrandShellContent | TaskShellContent {
  if (pathname === "/") {
    return {
      kind: "brand",
      eyebrow: "历史质感策略盘",
      subtitle: "以国家议程、资源调度与联盟博弈推进 19 世纪工业化竞逐。",
    };
  }

  if (pathname.startsWith("/lobby")) {
    return {
      kind: "brand",
      eyebrow: "集结入口",
      subtitle: "集结盟友、进入房间、正式开始这一局 19 世纪列强竞逐。",
    };
  }

  if (pathname.startsWith("/room/")) {
    return {
      kind: "task",
      description: "把玩家、国家和准备状态都确认好，房间满足条件后会自动开局。",
      eyebrow: "任务界面",
      title: "房间准备",
    };
  }

  if (pathname.startsWith("/game/")) {
    return {
      kind: "task",
      description: "先判断你当前是谁、现在该做什么，再完成本回合关键决策。",
      eyebrow: "任务界面",
      title: "当前对局",
    };
  }

  if (pathname.startsWith("/settlement/")) {
    return {
      kind: "task",
      description: "回看最终排名和关键结果，确认这一局是怎么收束的。",
      eyebrow: "任务界面",
      title: "对局结果",
    };
  }

  if (pathname.startsWith("/design/decision-card-demo")) {
    return {
      kind: "task",
      description: "对比不同卡片式决策交互，让工厂、议会厅和市民广场的填写方式更直观。",
      eyebrow: "设计验证",
      title: "决策卡片 DEMO",
    };
  }

  return {
    kind: "brand",
    eyebrow: "Tomorrow Question",
    subtitle: "把玩家组织进同一局，并让每一回合都知道该先看什么、该先做什么。",
  };
}

function resolveRoomCode(pathname: string): string | null {
  const match = /^\/room\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AppShell() {
  const location = useLocation();
  const shellContent = resolveShellContent(location.pathname);
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
              回到大厅
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
