import type {
  ApiErrorCode,
  DecisionSubmission,
  GamePhase,
  MarketSubmission,
} from "../../types";

const SUBMIT_ERROR_CODE_LABELS: Partial<Record<ApiErrorCode, string>> = {
  ALREADY_SUBMITTED: "你已提交过本阶段，等待结算即可。",
  DEADLINE_PASSED: "提交截止时间已过。",
  PHASE_MISMATCH: "当前阶段已切换，请刷新页面。",
  GAME_NOT_FOUND: "对局不存在或已结束。",
  NOT_ROOM_MEMBER: "你已不在该房间，无法提交。",
  NOT_READYABLE: "当前状态无法准备/提交。",
  INVALID_SESSION: "会话已失效，请重新登录。",
  RECOVERY_NOT_AVAILABLE: "无法恢复对局状态，请刷新页面。",
};

const INVALID_SUBMISSION_MESSAGE_PATTERNS: ReadonlyArray<{
  match: RegExp;
  translate: (match: RegExpMatchArray) => string;
}> = [
  { match: /^Factory budget exceeded/i, translate: () => "工厂预算超支，无法提交。" },
  { match: /^Domestic market budget exceeded/i, translate: () => "国民消费预算超支，无法提交。" },
  { match: /^Government fiscal budget exceeded/i, translate: () => "政府财政预算超支，无法提交。" },
  { match: /^Military action (\S+) exceeds maxPerRound/i, translate: (m) => `军事动作 ${m[1]} 超出本轮上限。` },
  { match: /^Military action (\S+) requires required technology/i, translate: (m) => `军事动作 ${m[1]} 需要前置科技。` },
  { match: /^Diplomacy action (\S+) requires required technology/i, translate: (m) => `外交动作 ${m[1]} 需要前置科技。` },
  { match: /^Diplomacy target (\S+) has already been established/i, translate: (m) => `区域 ${m[1]} 已建交，本轮不能重复提交。` },
  { match: /^Diplomacy target (\S+) is duplicated/i, translate: (m) => `区域 ${m[1]} 在本次提交中重复。` },
  { match: /^Domestic action (\S+) requires required technology/i, translate: (m) => `国民消费动作 ${m[1]} 需要前置科技。` },
  { match: /^Expansion route (\S+) is not unlocked/i, translate: (m) => `生产线 ${m[1]} 尚未解锁，无法扩张。` },
  { match: /^Upgrade route (\S+) requires route technology/i, translate: (m) => `生产线 ${m[1]} 需要先研究升级科技。` },
  { match: /^Upgrade route (\S+) has no available source route capacity/i, translate: (m) => `生产线 ${m[1]} 没有可升级的源产能。` },
  { match: /^Unknown military action: (\S+)/i, translate: (m) => `未知军事动作：${m[1]}。` },
  { match: /^Unknown diplomacy action: (\S+)/i, translate: (m) => `未知外交动作：${m[1]}。` },
  { match: /^Overseas market region (\S+) is not accessible/i, translate: (m) => `海外区域 ${m[1]} 当前不可访问。` },
  { match: /^Overseas market region (\S+) is invalid/i, translate: (m) => `海外区域 ${m[1]} 无效。` },
  { match: /^Overseas market sale order requires regionId/i, translate: () => "海外销售指令缺少区域。" },
  { match: /^The current phase deadline has already passed/i, translate: () => "提交截止时间已过。" },
  { match: /^The player has already submitted/i, translate: () => "你已提交过本阶段。" },
  { match: /^Settlement is a system phase/i, translate: () => "结算阶段不接受玩家提交。" },
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
    return "提交失败，请稍后再试。";
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
        },
      };
    case "settlement":
      return {};
    default:
      return {};
  }
}
