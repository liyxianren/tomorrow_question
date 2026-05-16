import i18n from "../../i18n";
import type {
  ApiErrorCode,
  BudgetPools,
  DecisionSubmission,
  GamePhase,
  MarketSubmission,
  Phase1EconomyWorkspace,
} from "../../types";

const SUBMIT_ERROR_CODE_LABELS: Partial<Record<ApiErrorCode, string>> = {
  ALREADY_SUBMITTED: i18n.t("game:submit.alreadySubmittedMsg", "你已提交过本阶段，等待结算即可。"),
  DEADLINE_PASSED: i18n.t("game:submit.deadlinePassed", "提交截止时间已过。"),
  PHASE_MISMATCH: i18n.t("game:submit.phaseMismatch", "当前阶段已切换，请刷新页面。"),
  GAME_NOT_FOUND: i18n.t("game:submit.gameNotFound", "对局不存在或已结束。"),
  NOT_ROOM_MEMBER: i18n.t("game:submit.notRoomMember", "你已不在该房间，无法提交。"),
  NOT_READYABLE: i18n.t("game:submit.notReadyable", "当前状态无法准备/提交。"),
  INVALID_SESSION: i18n.t("game:submit.invalidSession", "会话已失效，请重新登录。"),
  RECOVERY_NOT_AVAILABLE: i18n.t("game:submit.recoveryNotAvailable", "无法恢复对局状态，请刷新页面。"),
};

const INVALID_SUBMISSION_MESSAGE_PATTERNS: ReadonlyArray<{
  match: RegExp;
  translate: (match: RegExpMatchArray) => string;
}> = [
  { match: /^Factory budget exceeded/i, translate: () => i18n.t("game:submit.errorFactoryBudgetExceeded", "工厂预算超支，无法提交。") },
  { match: /^Domestic market budget exceeded/i, translate: () => i18n.t("game:submit.errorDomesticBudgetExceeded", "国民消费预算超支，无法提交。") },
  { match: /^Government fiscal budget exceeded/i, translate: () => i18n.t("game:submit.errorGovernmentBudgetExceeded", "政府财政预算超支，无法提交。") },
  { match: /^Military action (\S+) exceeds maxPerRound/i, translate: (m) => i18n.t("game:submit.errorMilitaryExceedsMax", "军事动作 {{action}} 超出本轮上限。", { action: m[1] }) },
  { match: /^Military action (\S+) requires required technology/i, translate: (m) => i18n.t("game:submit.errorMilitaryNeedsTech", "军事动作 {{action}} 需要前置科技。", { action: m[1] }) },
  { match: /^Diplomacy action (\S+) requires required technology/i, translate: (m) => i18n.t("game:submit.errorDiplomacyNeedsTech", "外交动作 {{action}} 需要前置科技。", { action: m[1] }) },
  { match: /^Diplomacy target (\S+) has already been established/i, translate: (m) => i18n.t("game:submit.errorDiplomacyEstablished", "区域 {{region}} 已建交，本轮不能重复提交。", { region: m[1] }) },
  { match: /^Diplomacy target (\S+) is duplicated/i, translate: (m) => i18n.t("game:submit.errorDiplomacyDuplicated", "区域 {{region}} 在本次提交中重复。", { region: m[1] }) },
  { match: /^Domestic action (\S+) requires required technology/i, translate: (m) => i18n.t("game:submit.errorDomesticNeedsTech", "旧市场调节动作 {{action}} 需要前置科技。", { action: m[1] }) },
  { match: /^Factory action (\S+) requires required technology/i, translate: (m) => i18n.t("game:submit.errorFactoryNeedsTech", "工厂调度 {{action}} 需要前置科技。", { action: m[1] }) },
  { match: /^Factory action (\S+) is duplicated/i, translate: (m) => i18n.t("game:submit.errorFactoryDuplicated", "工厂调度 {{action}} 重复提交。", { action: m[1] }) },
  { match: /^Unknown factory action: (\S+)/i, translate: (m) => i18n.t("game:submit.errorUnknownFactoryAction", "未知工厂调度：{{action}}。", { action: m[1] }) },
  { match: /^Expansion route (\S+) is not unlocked/i, translate: (m) => i18n.t("game:submit.errorExpansionNotUnlocked", "生产线 {{route}} 尚未解锁，无法扩张。", { route: m[1] }) },
  { match: /^Upgrade route (\S+) requires route technology/i, translate: (m) => i18n.t("game:submit.errorUpgradeNeedsTech", "生产线 {{route}} 需要先研究升级科技。", { route: m[1] }) },
  { match: /^Upgrade route (\S+) has no available source route capacity/i, translate: (m) => i18n.t("game:submit.errorUpgradeNoCapacity", "生产线 {{route}} 没有可升级的源产能。", { route: m[1] }) },
  { match: /^Unknown military action: (\S+)/i, translate: (m) => i18n.t("game:submit.errorUnknownMilitaryAction", "未知军事动作：{{action}}。", { action: m[1] }) },
  { match: /^Unknown diplomacy action: (\S+)/i, translate: (m) => i18n.t("game:submit.errorUnknownDiplomacyAction", "未知外交动作：{{action}}。", { action: m[1] }) },
  { match: /^Overseas market region (\S+) is not accessible/i, translate: (m) => i18n.t("game:submit.errorOverseasNotAccessible", "海外区域 {{region}} 当前不可访问。", { region: m[1] }) },
  { match: /^Overseas market region (\S+) is invalid/i, translate: (m) => i18n.t("game:submit.errorOverseasInvalid", "海外区域 {{region}} 无效。", { region: m[1] }) },
  { match: /^Overseas market sale order requires regionId/i, translate: () => i18n.t("game:submit.errorOverseasNoRegion", "海外销售指令缺少区域。") },
  { match: /^Overseas competition region (\S+) requires established diplomacy/i, translate: (m) => i18n.t("game:submit.errorCompetitionNeedsDiplomacy", "海外争夺区域 {{region}} 需要先建交。", { region: m[1] }) },
  { match: /^Overseas competition region (\S+) route is blocked/i, translate: (m) => i18n.t("game:submit.errorCompetitionRouteBlocked", "海外争夺区域 {{region}} 航线被封锁。", { region: m[1] }) },
  { match: /^Overseas competition region (\S+) is duplicated/i, translate: (m) => i18n.t("game:submit.errorCompetitionDuplicated", "海外争夺区域 {{region}} 重复提交。", { region: m[1] }) },
  { match: /^Overseas competition deployment exceeds available army/i, translate: () => i18n.t("game:submit.errorCompetitionArmyExceeded", "海外争夺兵力超过可用陆军。") },
  { match: /^Domestic market allocation \((\d+)\) exceeds domestic market capacity \((\d+)\)/i, translate: (m) => i18n.t("game:submit.errorDomesticOverCapacity", "国内投放 {{alloc}} 超过本轮承接能力 {{capacity}}。", { alloc: m[1], capacity: m[2] }) },
  { match: /^Domestic market allocation \((\d+)\) exceeds domestic demand \((\d+)\)/i, translate: (m) => i18n.t("game:submit.errorDomesticOverDemand", "国内投放 {{alloc}} 超过本轮需求 {{demand}}。", { alloc: m[1], demand: m[2] }) },
  { match: /^Domestic market allocation \((\d+)\) exceeds available goods inventory \((\d+)\)/i, translate: (m) => i18n.t("game:submit.errorDomesticOverInventory", "国内投放 {{alloc}} 超过库存 {{inventory}}。", { alloc: m[1], inventory: m[2] }) },
  { match: /^The current phase deadline has already passed/i, translate: () => i18n.t("game:submit.deadlinePassed", "提交截止时间已过。") },
  { match: /^The player has already submitted/i, translate: () => i18n.t("game:submit.alreadySubmittedMsg", "你已提交过本阶段。") },
  { match: /^Settlement is a system phase/i, translate: () => i18n.t("game:submit.errorSettlementSystemPhase", "结算阶段不接受玩家提交。") },
];

export interface SubmitErrorRejection {
  actionId?: string;
  reason: string;
  count?: number;
  maxPerRound?: number;
}

export function translateSubmitErrorMessage(code: string | null | undefined, rawMessage: string): string {
  if (code && code !== "INVALID_SUBMISSION") {
    const label = SUBMIT_ERROR_CODE_LABELS[code as ApiErrorCode];
    if (label) return label;
  }
  if (!rawMessage) {
    return i18n.t("game:submit.submitFailed", "提交失败，请稍后再试。");
  }
  for (const { match, translate } of INVALID_SUBMISSION_MESSAGE_PATTERNS) {
    const matched = rawMessage.match(match);
    if (matched) {
      return translate(matched);
    }
  }
  return rawMessage;
}

export function extractRejectedActions(details: Record<string, unknown> | undefined | null): SubmitErrorRejection[] {
  if (!details) return [];
  const raw = details.rejectedActions;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): SubmitErrorRejection[] => {
    if (!item || typeof item !== "object") return [];
    const reason = (item as Record<string, unknown>).reason;
    if (typeof reason !== "string" || !reason.trim()) return [];
    const actionId = (item as Record<string, unknown>).actionId;
    const count = (item as Record<string, unknown>).count;
    const maxPerRound = (item as Record<string, unknown>).maxPerRound;
    return [{
      reason: reason.trim(),
      actionId: typeof actionId === "string" && actionId.trim() ? actionId.trim() : undefined,
      count: typeof count === "number" ? count : undefined,
      maxPerRound: typeof maxPerRound === "number" ? maxPerRound : undefined,
    }];
  });
}

export function extractDetailReason(details: Record<string, unknown> | undefined | null): string | null {
  if (!details) return null;
  const reason = details.reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

export interface Phase1ProductionDraft {
  rawMaterialAssignments: Record<string, number>;
}

export type DecisionPhaseDraft = DecisionSubmission & {
  phase1Production?: Phase1ProductionDraft;
  reforms?: string[];
  activatePolicies?: string[];
  deactivatePolicies?: string[];
};
export type MarketPhaseDraft = MarketSubmission;
export type SettlementPhaseDraft = Record<string, never>;

export interface PhaseDraftByPhase {
  decision: DecisionPhaseDraft;
  market: MarketPhaseDraft;
  settlement: SettlementPhaseDraft;
}

export type PhaseDraft = PhaseDraftByPhase[GamePhase];

export function createInitialPhaseDraft(phase: "decision"): DecisionPhaseDraft;
export function createInitialPhaseDraft(phase: "market"): MarketPhaseDraft;
export function createInitialPhaseDraft(phase: "settlement"): SettlementPhaseDraft;
export function createInitialPhaseDraft(phase: GamePhase): PhaseDraft {
  switch (phase) {
    case "decision":
      return {
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
          techResearch: [],
          adminPurchases: 0,
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
        reforms: [],
        activatePolicies: [],
        deactivatePolicies: [],
      };
    case "market":
      return {
        saleOrders: [],
        phase1Market: {
          domesticAllocation: 0,
          externalAllocations: [],
          externalCompetitionDeployments: [],
        },
      };
    case "settlement":
      return {};
    default:
      return {};
  }
}

export function buildDecisionSubmission(draft: DecisionPhaseDraft): Record<string, unknown> {
  const techId = draft.governmentPlan.techResearch[0]?.techId;
  return {
    ...draft,
    ...(techId ? { researchTarget: techId } : {}),
  };
}

export function createDefaultPhase1ProductionDraft(
  workspace: {
    phase1Economy?: Phase1EconomyWorkspace;
    budgetPools?: Pick<BudgetPools, "factory">;
  } | null | undefined,
): Phase1ProductionDraft | undefined {
  const phase1 = workspace?.phase1Economy;
  if (!phase1 || phase1.rawMaterials <= 0) {
    return undefined;
  }

  let remainingRawMaterials = Math.min(
    Math.max(0, Math.floor(phase1.rawMaterials)),
    Math.max(0, Math.floor(workspace?.budgetPools?.factory ?? phase1.rawMaterials)),
  );
  const rawMaterialAssignments: Record<string, number> = {};
  const modesByEfficiency = [...phase1.productionModes]
    .filter((mode) => mode.isAvailable && mode.outputRatio > 0 && mode.currentCapacity > 0)
    .sort((a, b) => b.outputRatio - a.outputRatio);

  for (const mode of modesByEfficiency) {
    if (remainingRawMaterials <= 0) {
      break;
    }
    const capacity = Math.max(0, Math.floor(mode.currentCapacity));
    const assigned = Math.min(capacity, remainingRawMaterials);
    if (assigned > 0) {
      rawMaterialAssignments[mode.mode] = assigned;
      remainingRawMaterials -= assigned;
    }
  }

  return Object.keys(rawMaterialAssignments).length > 0
    ? { rawMaterialAssignments }
    : undefined;
}
