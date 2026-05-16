import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:5001";
const FRONTEND_BASE = process.env.E2E_FRONTEND_BASE_URL ?? "http://127.0.0.1:5173";
const SESSION_STORAGE_KEY = "tomorrow-question.session-id";
const COUNTRY_ORDER = ["britain", "france", "prussia", "austria", "russia"];
const PROJECT_ROOT = process.env.CQ_PROJECT_ROOT || process.cwd();
const REPORT_PATH = path.join(PROJECT_ROOT, "docs/playtests/2026-05-16-computer-use-1-15-bug-scan.md");
const SCREEN_DIR = path.join(PROJECT_ROOT, "docs/playtests/screenshots/run-2026-05-16-1-15");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, { method = "GET", body, sessionId } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }

  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  if (raw.includes("<!doctype html>")) {
    throw new Error(`请求 ${pathname} 返回了 HTML，前端或端口代理异常。`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`无法解析接口返回：${pathname} ${response.status} ${error.message}`);
  }

  if (!response.ok || payload.ok === false) {
    const msg = payload?.error?.message ?? "请求失败";
    const code = payload?.error?.code ?? "";
    throw new Error(`${pathname} ${response.status} ${code ? `[${code}]` : ""} ${msg}`);
  }

  return payload.data;
}

async function poll(condition, { intervalMs = 250, timeoutMs = 15000, message } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await condition();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  throw new Error(message || "等待条件超时");
}

async function createRoom() {
  const nicknameSuffix = Date.now().toString(36);
  const host = await request("/api/v1/rooms", {
    method: "POST",
    body: { nickname: `cq-host-${nicknameSuffix}` },
  });

  const roomCode = host.room.roomCode;
  const hostPlayer = {
    playerId: host.session.playerId,
    sessionId: host.session.sessionId,
    country: COUNTRY_ORDER[0],
    nickname: host.session.nickname,
  };

  const players = [hostPlayer];
  for (let i = 1; i < COUNTRY_ORDER.length; i += 1) {
    const joined = await request("/api/v1/rooms/join", {
      method: "POST",
      body: {
        roomCode,
        nickname: `cq-${COUNTRY_ORDER[i]}-${nicknameSuffix}`,
      },
    });
    players.push({
      playerId: joined.session.playerId,
      sessionId: joined.session.sessionId,
      country: COUNTRY_ORDER[i],
      nickname: joined.session.nickname,
    });
  }

  for (const player of players) {
    await request(`/api/v1/rooms/${roomCode}/country`, {
      method: "POST",
      sessionId: player.sessionId,
      body: { selectedCountry: player.country },
    });
  }

  for (const player of players) {
    await request(`/api/v1/rooms/${roomCode}/ready`, {
      method: "POST",
      sessionId: player.sessionId,
      body: { isReady: true },
    });
  }

  return { roomCode, players, hostPlayer };
}

async function restoreSession(sessionId) {
  return request("/api/v1/sessions/restore", {
    method: "POST",
    sessionId,
  });
}

async function waitForGameStart(hostSessionId) {
  return poll(async () => {
    const context = await restoreSession(hostSessionId);
    return context.activeGame && context.activeSnapshot ? context : null;
  }, {
    timeoutMs: 20_000,
    message: "游戏未进入进行中，可能未成功启动。",
  });
}

async function submitPhase(gameId, phase, sessionId, payload) {
  return request(`/api/v1/games/${gameId}/phases/${phase}`, {
    method: "POST",
    sessionId,
    body: { payload },
  });
}

function createDecisionPayload(workspace, playerState) {
  const budget = workspace?.budgetPools ?? playerState.budgetPools;
  const govBudget = budget.governmentFiscal ?? 0;
  const militaryBudget = workspace?.militaryWorkspace?.armyCap ?? 0;

  const strategy = (workspace?.governmentActions?.strategies ?? [])
    .filter((item) => !item.lockedReason)
    .find((item) => item.cost <= govBudget);

  const diplomacy = (workspace?.militaryWorkspace?.availableDiplomacyActions ?? [])
    .filter((item) => !item.isEstablished)
    .find((item) => item.cost <= govBudget);

  const capability = workspace?.militaryWorkspace?.colonizationCapability;
  const shouldUnlockColonization =
    Boolean(capability) &&
    !workspace?.colonizationUnlocked &&
    capability.unlockCost <= govBudget;

  const canColonize = (workspace?.militaryWorkspace?.colonizationOptions ?? [])
    .find((opt) => opt.canColonize && !opt.lockedReason && opt.budgetCost <= govBudget);

  const payload = {
    factoryPlan: {
      productionOrders: [],
      expansionOrders: [],
      upgradeOrders: [],
      newFactoryOrders: [],
      factoryActions: [],
    },
    domesticMarketPlan: {
      domesticMarketActions: [],
    },
    governmentPlan: {
      pointPurchases: [],
      strategySelections: [],
      adminPurchases: 0,
      techResearch: [],
    },
    militaryPlan: {
      unlockColonization: false,
      militaryActions: [],
      diplomacyActions: [],
      colonizationActions: [],
      navalDeployment: {},
      conquestActions: [],
      lootingActions: [],
    },
    talentPlan: {
      talentUnlocks: [],
    },
  };

  const expected = {
    government: null,
    diplomacy: null,
    unlockColonization: false,
    colonization: null,
    soldDomestic: 0,
    soldOverseas: 0,
  };

  if (strategy) {
    payload.governmentPlan.strategySelections.push({ actionId: strategy.actionId });
    expected.government = strategy.actionId;
  }

  if (diplomacy) {
    payload.militaryPlan.diplomacyActions.push({ actionId: diplomacy.actionId });
    expected.diplomacy = diplomacy.actionId.replace("establish_", "");
  }

  if (shouldUnlockColonization) {
    payload.militaryPlan.unlockColonization = true;
    expected.unlockColonization = true;
    if (capability && capability.unlockCost <= govBudget) {
      // avoid colonize in same round immediately after unlocking; 先验证解锁生效是否在本轮有效。
      expected.colonization = null;
    }
  } else if (capability?.isUnlocked && canColonize) {
    payload.militaryPlan.colonizationActions.push({ targetRegionId: canColonize.regionId });
    expected.colonization = canColonize.regionId;
  }

  // 如果政府面板可招募，避免点超预算；仅保守动作。
  const recruit = (workspace?.militaryWorkspace?.availableMilitaryActions ?? [])
    .find((item) => item.actionId === "recruit_army" && item.cost <= Math.max(0, militaryBudget));
  if (!strategy && recruit && militaryBudget > 0) {
    payload.militaryPlan.militaryActions.push({ actionId: recruit.actionId });
  }

  return { payload, expected, budgetPools: budget, budgetCheck: { govBudget, militaryBudget } };
}

function pickMarketPayload(workspace) {
  const orders = [];
  const sold = {
    domestic: 0,
    overseas: 0,
    domesticGoods: [],
    overseasGoods: [],
  };

  const domesticCap = workspace.domesticMarketCapacity ?? 0;
  const overseasCap = workspace.overseasMarketCapacity ?? 0;

  let domesticLeft = Math.max(0, Math.floor(domesticCap));
  let overseasLeft = Math.max(0, Math.floor(overseasCap));

  if (domesticLeft > 0) {
    const first = workspace.sellableInventory?.find((good) => good.quantity > 0) ?? null;
    if (first) {
      const q = Math.min(1, domesticLeft, first.quantity);
      if (q > 0) {
        orders.push({
          goodsId: first.goodsId,
          market: "domestic",
          quantity: q,
        });
        sold.domestic += q;
        sold.domesticGoods.push(`${first.goodsId}x${q}`);
        domesticLeft -= q;
      }
    }
  }

  const accessible = new Map(
    (workspace.regionAccessStatus ?? [])
      .filter((item) => !item.lockedReason && item.accessLevel && item.accessLevel !== "closed")
      .map((item) => [item.regionId, item]),
  );

  if (overseasLeft > 0) {
    for (const good of workspace.sellableInventory ?? []) {
      const maxQty = Math.min(1, overseasLeft, good.quantity);
      if (maxQty <= 0) {
        continue;
      }
      const region = [...accessible.values()].find((region) =>
        (region.acceptedGoods ?? []).includes(good.goodsId),
      );
      if (!region) {
        continue;
      }
      orders.push({
        goodsId: good.goodsId,
        market: "overseas",
        quantity: maxQty,
        regionId: region.regionId,
      });
      sold.overseas += maxQty;
      sold.overseasGoods.push(`${good.goodsId}->${region.regionId}x${maxQty}`);
      overseasLeft -= maxQty;
      break;
    }
  }

  return { payload: { saleOrders: orders }, sold };
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

async function safeRouteFixture(page, apiBase) {
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": FRONTEND_BASE,
          "access-control-allow-methods": request.headers()["access-control-request-method"] ?? "GET,POST,OPTIONS",
          "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "content-type,x-session-id",
          vary: "Origin",
        },
      });
      return;
    }

    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "access-control-allow-origin": FRONTEND_BASE,
        "access-control-allow-credentials": "true",
        vary: "Origin",
      },
    });
  });
}

function toSnapshotIssueText(runtime, phaseLabel, phaseWorkspace) {
  const playerState = runtime.activeSnapshot.nationalStateByPlayer[playerId(runtime)];
}

function playerIdFromRuntime(runtime) {
  return runtime.session?.playerId ?? null;
}

function expectedColonizationAchieved(runtime, countryId, regionId) {
  const region = (runtime.activeSnapshot.regionStates ?? []).find((item) => item.regionId === regionId);
  return Boolean(region && region.controller === countryId);
}

function hasDiplomacy(runtime, playerId, region) {
  const state = runtime.activeSnapshot.nationalStateByPlayer[playerId];
  return (state?.establishedDiplomacy ?? []).includes(region);
}

function lineForPhaseWorkspace(phaseWorkspace, playerId) {
  const w = phaseWorkspace?.players?.[playerId] ?? null;
  if (!w) {
    return { ok: false, message: "未获取到当前玩家工作区" };
  }

  const summary = {
    budget: w.budgetPools ?? null,
    military: w.militaryWorkspace ?? null,
    gov: w.governmentActions ?? null,
    regionCount: phaseWorkspace.players ? Object.keys(phaseWorkspace.players).length : 0,
  };
  return { ok: true, message: JSON.stringify(summary) };
}

async function run() {
  await fs.mkdir(SCREEN_DIR, { recursive: true });

  const context = await createRoom();
  const { roomCode, players, hostPlayer } = context;
  const hostSession = hostPlayer.sessionId;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await safeRouteFixture(page, API_BASE);
  await page.addInitScript(
    ([key, sessionId]) => {
      window.localStorage.setItem(key, sessionId);
    },
    [SESSION_STORAGE_KEY, hostSession],
  );

  const createContext = await waitForGameStart(hostSession);
  let runtime = createContext;
  let playerId = hostPlayer.playerId;

  await page.goto(`${FRONTEND_BASE}/game/${runtime.activeGame.gameId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="game-round"]');

  const report = {
    startedAt: new Date().toISOString(),
    roomCode,
    gameId: runtime.activeGame.gameId,
    apiBase: API_BASE,
    frontendBase: FRONTEND_BASE,
    rounds: [],
  };

  const pendingChecks = [];
  const anomalies = [];

  let safety = 0;
  let latestRound = runtime.activeSnapshot.round;

  while (safety < 200 && runtime.activeSnapshot.round <= 15 && !runtime.activeGame.isFinished) {
    safety += 1;
    const phase = runtime.activeSnapshot.phase;
    const round = runtime.activeSnapshot.round;
    const snapshotIdBefore = runtime.activeSnapshot.snapshotId;
    const phaseWorkspace = runtime.activeSnapshot.phaseWorkspace;
    const playerWorkspace = phaseWorkspace?.players?.[playerId];

    const roundEntry = {
      round,
      phase,
      issues: [],
      ui: [],
      actions: [],
      checks: {},
      screenshot: null,
    };

    const timestamp = `${String(round).padStart(2, "0")}-${phase}`;
    const screenshotPath = path.join(SCREEN_DIR, `round-${timestamp}.png`);

    // 顶部文字
    const phaseText = normalizeText(await page.getByTestId("game-phase").textContent());
    const roundText = normalizeText(await page.getByTestId("game-round").textContent());
    const countryText = normalizeText(await page.getByTestId("game-country").textContent());
    roundEntry.ui.push(`UI ${roundText} / ${phaseText} / 国家: ${countryText}`);

    if (phase === "decision") {
      // 决策面板交互：每个可见阶段至少切一次，确认可用性。
      const tabs = ["factory", "government", "domestic", "military", "research"];
      const panelByTab = {
        factory: "factory-panel",
        government: "government-panel",
        domestic: "domestic-panel",
        military: "military-panel",
        research: "military-panel", // 研究入口已并入后续结构，仍保底不报错
      };

      for (const tab of tabs) {
        const tabLocator = page.getByTestId(`decision-step-tab-${tab}`);
        const hasTab = (await tabLocator.count()) > 0;
        if (!hasTab) {
          roundEntry.ui.push(`步骤按钮缺失: ${tab}`);
          continue;
        }
        await tabLocator.click();
        await sleep(120);
        const panelId = panelByTab[tab];
        const panelExists = panelId ? (await page.getByTestId(panelId).count()) > 0 : true;
        if (!panelExists) {
          roundEntry.issues.push(`决策切页异常：点击 ${tab} 后未渲染对应面板 (${panelId})`);
        }
      }

      const payloadInfo = createDecisionPayload(playerWorkspace, runtime.activeSnapshot.nationalStateByPlayer[playerId]);
      roundEntry.actions.push({
        type: "decision_submit",
        summary: {
          chosenGovernment: payloadInfo.expected.government,
          chosenDiplomacy: payloadInfo.expected.diplomacy,
          unlockColonization: payloadInfo.expected.unlockColonization,
          chosenColonization: payloadInfo.expected.colonization,
        },
      });

      if (payloadInfo.expected.government === null && payloadInfo.expected.diplomacy === null && !payloadInfo.expected.unlockColonization && !payloadInfo.expected.colonization) {
        roundEntry.ui.push("未检测到可执行且可支付的政策/外交/殖民操作，使用最小默认提交");
      }

      if (payloadInfo.expected.diplomacy) {
        pendingChecks.push({
          type: "diplomacy",
          region: payloadInfo.expected.diplomacy,
          round,
          playerId,
        });
      }
      if (payloadInfo.expected.unlockColonization) {
        pendingChecks.push({
          type: "unlockColonization",
          round,
          playerId,
        });
      }
      if (payloadInfo.expected.colonization) {
        pendingChecks.push({
          type: "colonization",
          region: payloadInfo.expected.colonization,
          round,
          playerId,
        });
      }

      await submitPhase(runtime.activeGame.gameId, "decision", hostSession, payloadInfo.payload);
      for (const p of players) {
        if (p.sessionId === hostSession) {
          continue;
        }
        await submitPhase(runtime.activeGame.gameId, "decision", p.sessionId, {
          factoryPlan: {
            productionOrders: [],
            expansionOrders: [],
            upgradeOrders: [],
            newFactoryOrders: [],
          },
          domesticMarketPlan: { domesticMarketActions: [] },
          governmentPlan: { pointPurchases: [], strategySelections: [], adminPurchases: 0, techResearch: [] },
          militaryPlan: {
            unlockColonization: false,
            militaryActions: [],
            diplomacyActions: [],
            colonizationActions: [],
            navalDeployment: {},
            conquestActions: [],
            lootingActions: [],
          },
          talentPlan: { talentUnlocks: [] },
        });
      }

      runtime = await poll(
        async () => {
          const latest = await restoreSession(hostSession);
          if (!latest.activeSnapshot) {
            return null;
          }
          if (
            latest.activeSnapshot.snapshotId !== snapshotIdBefore ||
            latest.activeSnapshot.round !== round ||
            latest.activeSnapshot.phase !== phase
          ) {
            return latest;
          }
          return null;
        },
        { timeoutMs: 20_000, message: `决策轮提交后未推进（回合 ${round}）` },
      );
    } else if (phase === "market") {
      const marketPayload = pickMarketPayload(playerWorkspace);
      roundEntry.actions.push({
        type: "market_submit",
        sold: marketPayload.sold,
        sellOrderCount: marketPayload.payload.saleOrders.length,
      });

      const marketLocator = page.getByTestId("market-workbench");
      const hasMarketWorkbench = (await marketLocator.count()) > 0;
      if (!hasMarketWorkbench) {
        roundEntry.issues.push("市场阶段未展示 market-workbench 区域");
      }

      const phasePanelExists = (await page.getByTestId("phase1-market-panel").count()) > 0;
      roundEntry.checks.marketPanelExists = phasePanelExists;

      await submitPhase(runtime.activeGame.gameId, "market", hostSession, marketPayload.payload);
      for (const p of players) {
        if (p.sessionId === hostSession) {
          continue;
        }
        await submitPhase(runtime.activeGame.gameId, "market", p.sessionId, { saleOrders: [] });
      }

      const before = runtime;
      runtime = await poll(
        async () => {
          const latest = await restoreSession(hostSession);
          if (!latest.activeSnapshot) {
            return null;
          }
          if (
            latest.activeSnapshot.snapshotId !== snapshotIdBefore ||
            latest.activeSnapshot.round !== round ||
            latest.activeSnapshot.phase !== phase
          ) {
            // 处理市场到结算阶段。
            return latest;
          }
          return null;
        },
        { timeoutMs: 20_000, message: `市场轮提交后未推进（回合 ${round}）` },
      );

      const settlementData = runtime.activeSnapshot.phaseWorkspace?.players?.[playerId];
      if (settlementData && runtime.activeSnapshot.phase === "settlement") {
        const expectedDomestic = marketPayload.sold.domestic;
        const expectedOverseas = marketPayload.sold.overseas;
        const gotDomestic = settlementData?.domesticSalesRevenue ?? 0;
        const gotOverseas = settlementData?.overseasSalesRevenue ?? 0;

        roundEntry.checks.marketIncome = {
          expectedSaleOrders: { domestic: expectedDomestic, overseas: expectedOverseas },
          settlementRevenue: { domestic: gotDomestic, overseas: gotOverseas },
        };
      }
    } else if (phase === "settlement") {
      const settlementWorkspace = runtime.activeSnapshot.phaseWorkspace?.summaryCards?.[0]
        ? runtime.activeSnapshot.phaseWorkspace.summaryCards[0]
        : runtime.activeSnapshot.phaseWorkspace?.players?.[playerId] ?? null;

      const settlementData = runtime.activeSnapshot.phaseWorkspace?.players?.[playerId];
      if (settlementData) {
        roundEntry.checks.settlement = {
          domesticSales: settlementData.domesticSalesRevenue,
          overseasSales: settlementData.overseasSalesRevenue,
          colonyIncome: settlementData.colonyIncome ?? 0,
          budgetAllocation: settlementData.budgetAllocation,
        };
      }

      const isLastRound = round === 15;
      if (runtime.activeSnapshot.ranking?.length) {
        const rankLine = runtime.activeSnapshot.ranking
          .map((it) => `${it.rank}.player(${it.playerId.slice(0, 6)})=${it.cumulativeNationalIncome}`)
          .join("; ");
        roundEntry.checks.ranking = rankLine;
      }

      if (isLastRound && runtime.activeGame.isFinished) {
        roundEntry.ui.push("检测到终局状态");
      }

      runtime = await poll(
        async () => {
          const latest = await restoreSession(hostSession);
          if (!latest.activeSnapshot) {
            return null;
          }
          if (
            latest.activeSnapshot.snapshotId !== snapshotIdBefore ||
            latest.activeSnapshot.round !== round ||
            latest.activeSnapshot.phase !== phase
          ) {
            return latest;
          }
          return null;
        },
        { timeoutMs: 20_000, message: `结算推进超时（回合 ${round}）` },
      );
    }

    // 截图和最终 UI 基础信息
    await page.screenshot({ path: screenshotPath, fullPage: true });
    roundEntry.screenshot = path.relative(process.cwd(), screenshotPath);

    // 对比待验项（外交/殖民）
    const stillPending = [];
    for (const item of pendingChecks) {
      if (item.type === "diplomacy") {
        if (hasDiplomacy(runtime, playerId, item.region)) {
          continue;
        }
        if (runtime.activeSnapshot.round > item.round || runtime.activeGame.isFinished) {
          roundEntry.issues.push(`回合 ${round}：预期建交 ${item.region} 未生效。`);
          anomalies.push(`回合${item.round}未见建交生效：${item.region}`);
          continue;
        }
      }
      if (item.type === "unlockColonization") {
        const state = runtime.activeSnapshot.nationalStateByPlayer[item.playerId];
        if (state && state.colonizationUnlocked) {
          continue;
        }
        if (runtime.activeSnapshot.round > item.round || runtime.activeGame.isFinished) {
          roundEntry.issues.push(`回合 ${round}：预期本轮解锁殖民能力未生效。`);
          anomalies.push(`回合${item.round}未见殖民能力解锁生效`);
          continue;
        }
      }
      if (item.type === "colonization") {
        if (expectedColonizationAchieved(runtime, COUNTRY_ORDER[0], item.region)) {
          continue;
        }
        if (runtime.activeSnapshot.round > item.round || runtime.activeGame.isFinished) {
          roundEntry.issues.push(`回合 ${round}：预期本轮殖民 ${item.region} 未生效。`);;
          anomalies.push(`回合${item.round}殖民未生效: ${item.region}`);
          continue;
        }
      }
      stillPending.push(item);
    }
    pendingChecks.length = 0;
    pendingChecks.push(...stillPending);

    // 捕获一些数值与状态一致性对照
    const state = runtime.activeSnapshot.nationalStateByPlayer[playerId];
    const leftArmy = state?.army?.army;
    const leftCap = state?.armyCap;
    const budgetStrip = runtime.activeSnapshot.phaseWorkspace?.players?.[playerId]?.budgetPools;
    if (budgetStrip) {
      const leftText = await page.locator('[data-testid="game-left-rail"]').innerText().catch(() => null);
      if (leftText) {
        const norm = normalizeText(leftText);
        if (leftText.includes("陆军") && leftCap !== undefined && leftArmy !== undefined) {
          if (!norm.includes(`陆军 ${leftArmy}/${leftCap}`) && !norm.includes(`陆军 ${leftArmy}/${leftCap} `)) {
            roundEntry.issues.push(`UI左栏军队显示疑似不一致：后端陆军 ${leftArmy}/${leftCap}，当前左栏未匹配到该值。`);
            anomalies.push(`回合${round}军队显示不一致`);
          }
        }
      }
    }

    report.rounds.push(roundEntry);

    if (runtime.activeGame.isFinished) {
      break;
    }

    if (runtime.activeSnapshot.round === latestRound && runtime.activeSnapshot.phase === phase) {
      // 防御性兜底，避免死循环
      // 理论上不会触发；若触发则尝试一次短暂等待后退出。
      await sleep(300);
      const latest = await restoreSession(hostSession);
      if (latest.activeSnapshot && latest.activeSnapshot.snapshotId === snapshotIdBefore) {
        throw new Error(`回合 ${round} 阶段 ${phase} 未推进，疑似卡住。`);
      }
      runtime = latest;
    }

    latestRound = runtime.activeSnapshot.round;
  }

  await page.close();
  await browser.close();

  let md = [];
  md.push("# 1-15 回合 Computer Use 逻辑巡检（仅记录）");
  md.push("");
  md.push("## 基本信息");
  md.push(`- 房间码：\`${report.roomCode}\``);
  md.push(`- 游戏ID：\`${report.gameId}\``);
  md.push(`- 前端：${report.frontendBase}`);
  md.push(`- 后端：${report.apiBase}`);
  md.push(`- 运行时间：${report.startedAt}`);
  md.push("- 用法：全程不修复、仅记录问题，重点关注政府政策、军事、殖民、出售。");
  md.push("");

  const allIssues = [];
  for (const r of report.rounds) {
    md.push(`## 第 ${r.round} 回合`);
    md.push(`- 阶段：${r.phase}`);
    if (r.screenshot) {
      md.push(`- 截图：\`${r.screenshot}\``);
    }
    if (r.actions.length) {
      md.push(`- 动作：${r.actions.map((a) => JSON.stringify(a)).join("；")}`);
    }
    if (r.ui.length) {
      md.push("- 记录项：");
      for (const u of r.ui) {
        md.push(`  - ${u}`);
      }
    }
    if (r.issues.length) {
      md.push("- 异常：");
      for (const issue of r.issues) {
        md.push(`  - ${issue}`);
        allIssues.push({ round: r.round, issue });
      }
    }
    if (Object.keys(r.checks).length) {
      md.push("- 校验:");
      md.push("```json");
      md.push(JSON.stringify(r.checks, null, 2));
      md.push("```");
    }
    md.push("");
  }

  if (allIssues.length === 0) {
    md.push("## 结果");
    md.push("本轮 1-15 回合未发现可复现高优先级逻辑异常。");
  } else {
    md.push("## 结果");
    md.push("共计发现问题：");
    for (const item of allIssues) {
      md.push(`- 第 ${item.round} 回合：${item.issue}`);
    }
  }

  await fs.writeFile(REPORT_PATH, md.join("\n"));
  console.log(`REPORT:${REPORT_PATH}`);
  console.log(`ROUND_COUNT:${report.rounds.length}`);
  for (const item of allIssues) {
    console.log(`ISSUE:r${item.round}:${item.issue}`);
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
