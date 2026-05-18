import { useMemo, useState } from "react";

import { GameMapView } from "../game/layout/GameMapView";
import { DecisionWorkbench } from "../game/panels/GamePhasePanelContent";
import { createInitialDecisionFlowState, setDecisionActiveStep } from "../../features/game/flow/decisionFlow";
import type { DecisionStepId } from "../../features/game/flow/decisionFlow";
import { buildBuildingDefs, MAP_IMAGE_BY_COUNTRY } from "../../features/game/flow/useMapViewState";
import { createInitialPhaseDraft } from "../../features/game/forms";
import type { ParameterBinding, ParameterBindingSource, ParameterInspector } from "../../features/game/parameterInspector";
import type { DecisionPlayerPhaseWorkspace, PlayerState } from "../../types";
import "./DecisionParameterSandbox.css";

const DECISION_BUILDING_STEP_MAP: Record<string, DecisionStepId> = {
  factory: "factory",
  domestic: "domestic",
  government: "government",
  military: "military",
  research: "research",
};

type DecisionSandboxPayload = {
  countryId: string;
  playerId: string;
  roundNo: number;
  phase: "decision";
  playerState: PlayerState;
  decisionWorkspace: DecisionPlayerPhaseWorkspace;
  parameterBindings: ParameterBinding[];
};

type DecisionParameterSandboxProps = {
  sandbox: DecisionSandboxPayload | null | undefined;
  getSourceValue: (source: ParameterBindingSource) => number;
  onSourceValueChange: (source: ParameterBindingSource, value: number) => void;
};

export function DecisionParameterSandbox({
  sandbox,
  getSourceValue,
  onSourceValueChange,
}: DecisionParameterSandboxProps) {
  const [activeModalId, setActiveModalId] = useState<string | null>(null);
  const [activeParameterKey, setActiveParameterKey] = useState<string | null>(null);
  const [decisionFlowState, setDecisionFlowState] = useState(createInitialDecisionFlowState);
  const [draft, setDraft] = useState(() => createInitialPhaseDraft("decision"));

  const bindingByTarget = useMemo(() => {
    const map = new Map<string, ParameterBinding>();
    for (const binding of sandbox?.parameterBindings ?? []) {
      map.set(binding.targetKey, binding);
    }
    return map;
  }, [sandbox?.parameterBindings]);

  if (!sandbox) {
    return (
      <div className="settings-sandbox-empty">
        参数关系沙盒暂不可用：后端没有返回英国第 1 回合基线。
      </div>
    );
  }

  const buildings = buildBuildingDefs(
    "decision",
    sandbox.playerState,
    sandbox.countryId,
    sandbox.decisionWorkspace,
  );
  const activeBuilding = buildings.find((building) => building.id === activeModalId) ?? null;

  const parameterInspector: ParameterInspector = {
    render: (targetKey, options) => (
      <ParameterInspectorBox
        key={targetKey}
        binding={bindingByTarget.get(targetKey) ?? null}
        currentEffect={options?.currentEffect}
        fallbackTitle={options?.title}
        getSourceValue={getSourceValue}
        isExpanded={activeParameterKey === targetKey}
        onSourceValueChange={onSourceValueChange}
        onToggle={() => setActiveParameterKey((previous) => (previous === targetKey ? null : targetKey))}
      />
    ),
  };

  function openBuilding(buildingId: string) {
    setActiveModalId(buildingId);
    const step = DECISION_BUILDING_STEP_MAP[buildingId];
    if (step) {
      setDecisionFlowState((previous) => setDecisionActiveStep(previous, step));
    }
  }

  return (
    <div className="settings-parameter-sandbox">
      <GameMapView
        activeModalId={activeModalId}
        bottomDock={
          <div className="settings-sandbox-help">
            点击地图建筑打开真实决策面板；再点卡片内的“查看数值关系”。
          </div>
        }
        buildings={buildings}
        inlineContent={
          <div className="settings-sandbox-banner">
            这是设置页沙盒，不会提交真实回合。当前基线：英国 · 第 {sandbox.roundNo} 回合。
          </div>
        }
        mapImage={MAP_IMAGE_BY_COUNTRY[sandbox.countryId] ?? MAP_IMAGE_BY_COUNTRY.britain}
        modalContent={
          activeModalId ? (
            <DecisionWorkbench
              decisionFlowState={decisionFlowState}
              draft={draft}
              onChange={setDraft}
              onComplete={() => setActiveModalId(null)}
              onDecisionFlowChange={setDecisionFlowState}
              parameterInspector={parameterInspector}
              workspace={sandbox.decisionWorkspace}
            />
          ) : null
        }
        modalTitle={activeBuilding?.label ?? "参数关系"}
        modalVariant={activeModalId}
        onBuildingClick={openBuilding}
        onModalClose={() => setActiveModalId(null)}
        showBackLink={false}
        situationBar={
          <div className="settings-sandbox-status">
            <strong>英国 · 第 {sandbox.roundNo} 回合 · 决策阶段</strong>
            <span>财政 {sandbox.decisionWorkspace.budgetPools.governmentFiscal} · 工厂预算 {sandbox.decisionWorkspace.budgetPools.factory} · 行政力 {sandbox.playerState.administrationCapacity}</span>
          </div>
        }
      />
    </div>
  );
}

function ParameterInspectorBox({
  binding,
  currentEffect,
  fallbackTitle,
  getSourceValue,
  isExpanded,
  onSourceValueChange,
  onToggle,
}: {
  binding: ParameterBinding | null;
  currentEffect?: string;
  fallbackTitle?: string;
  getSourceValue: (source: ParameterBindingSource) => number;
  isExpanded: boolean;
  onSourceValueChange: (source: ParameterBindingSource, value: number) => void;
  onToggle: () => void;
}) {
  const sources = binding?.sources ?? [];
  const sourceImpacts = sources.map(describeSourceImpact);
  return (
    <div
      className={`parameter-inspector${isExpanded ? " parameter-inspector--expanded" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button className="parameter-inspector__toggle" type="button" onClick={onToggle}>
        {isExpanded ? "收起数值关系" : "查看数值关系"}
      </button>
      {isExpanded ? (
        <div className="parameter-inspector__body">
          <div className="parameter-inspector__section">
            <span className="parameter-inspector__label">本次点击变化</span>
            <strong>{binding?.title ?? fallbackTitle ?? "当前按钮"}</strong>
            <p>{binding?.currentEffect || currentEffect || "这个按钮主要受规则前置或阶段状态控制，当前没有额外数值变化。"}</p>
          </div>
          <div className="parameter-inspector__section">
            <span className="parameter-inspector__label">玩家视角怎么理解</span>
            {sourceImpacts.length > 0 ? (
              <ul className="parameter-inspector__impact-list">
                {sourceImpacts.map((impact, index) => (
                  <li key={`${impact}-${index}`}>{impact}</li>
                ))}
              </ul>
            ) : (
              <p>这个元素主要告诉玩家前置条件、锁定原因或流程状态；没有直接可调的数值参数。</p>
            )}
          </div>
          <div className="parameter-inspector__section">
            <span className="parameter-inspector__label">可编辑参数</span>
            {sources.length > 0 ? (
              <div className="parameter-inspector__sources">
                {sources.map((source) => {
                  const value = getSourceValue(source);
                  return (
                    <label
                      key={`${source.fileName}:${JSON.stringify(source.path)}`}
                      className="parameter-inspector__source"
                    >
                      <span>
                        <strong>{source.label ?? source.fieldLabel ?? source.pathLabel}</strong>
                        <em>{describeSourceImpact(source)}</em>
                        <code>{source.fileName} · {source.pathLabel}</code>
                      </span>
                      <input
                        type="number"
                        step={Number.isInteger(value) ? 1 : 0.1}
                        value={value}
                        onChange={(event) => onSourceValueChange(source, Number(event.target.value))}
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <p>这个元素当前没有可编辑 JSON 数值；它展示的是规则前置、阶段锁定或硬编码流程效果。</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function describeSourceImpact(source: ParameterBindingSource): string {
  const pathText = source.path.map(String).join(".");
  const last = String(source.path[source.path.length - 1] ?? "");
  const label = source.fieldLabel ?? source.label ?? source.pathLabel;

  if (pathText.includes("expansionCosts") || pathText.includes("newFactoryCosts") || pathText.includes("upgradeCosts")) {
    return `${label}：控制玩家点击这个工厂建设按钮要花多少工厂预算；调高会放慢工业扩张，调低会更容易堆产能。`;
  }
  if (last === "administrationCost") {
    return `${label}：控制永久购买 1 点行政力上限要花多少政府财政；调高会限制改革和政策连点，调低会让政府行动更宽松。`;
  }
  if (last === "budgetPoolCost" || last === "budgetCost" || last === "cost" || last === "unitBudgetCost") {
    return `${label}：控制玩家点击这个按钮要花多少预算；调高会更难选择，调低会更容易连续使用。`;
  }
  if (last === "adminCost" || last === "adminCostPerTurn") {
    return `${label}：控制这个政策或改革要占多少行政力；调高会压缩同回合可选政策数量。`;
  }
  if (last === "maxPerRound") {
    return `${label}：控制同一回合最多能点几次；调高会放大这个按钮的上限。`;
  }
  if (last === "capacityDelta" || pathText.includes("CapacityDelta")) {
    return `${label}：控制本次选择带来的容量或产能变化；正数越大，玩家下回合或本回合可承接/生产越多。`;
  }
  if (last === "outputMultipliers" || pathText.includes("outputMultipliers") || last === "productionOutputMultiplier" || pathText.includes("productionOutputMultiplier")) {
    return `${label}：控制生产倍率；调高会让同样原材料产出更多商品。`;
  }
  if (last === "threshold") {
    return `${label}：控制解锁或研究门槛；调高会让玩家更晚拿到这个效果，调低会更快解锁。`;
  }
  if (last === "breakthroughDieSides") {
    return `${label}：控制科技突破骰子的面数；会影响达到研究门槛后的突破概率。`;
  }
  if (last.includes("Price") || pathText.includes("Price") || last === "priceMultiplier") {
    return `${label}：控制出售价格或价格倍率；调高通常会提高卖货收入。`;
  }
  if (last.includes("ideology") || pathText.includes("ideology") || pathText.includes("Ideology")) {
    return `${label}：控制思潮压力变化；正数会永久推高对应思潮，负数会永久缓和风险。`;
  }
  if (last === "ratioDelta" || pathText.includes("ratioDelta")) {
    return `${label}：控制本轮收入分配变化；会临时改变钱流向消费、工厂预算或政府财政的比例。`;
  }
  if (last === "researchFacilityCost" || pathText.includes("researchFacility")) {
    return `${label}：控制研究院成本或每回合研究推进速度；影响玩家研究节奏。`;
  }
  if (last.includes("Delta") || pathText.includes("Delta")) {
    return `${label}：控制本次选择带来的增减值；正数是加成，负数是代价。`;
  }

  return `${label}：这个数值会参与当前按钮的规则计算；修改后保存，会改变玩家下次进入游戏时看到的成本、门槛或加成。`;
}

export type { DecisionSandboxPayload };
