import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "../components/i18n/LanguageSwitcher";
import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { DecisionParameterSandbox, type DecisionSandboxPayload } from "../components/settings/DecisionParameterSandbox";
import type { ParameterBindingSource } from "../features/game/parameterInspector";
import i18n from "../i18n";
import { apiRequest } from "../services/http";
import "./SettingsPage.css";


type IdeologyShiftRule = { highThreshold: number; lowThreshold: number };

type NumericPathSegment = string | number;

type NumericConfigEntry = {
  path: NumericPathSegment[];
  pathLabel: string;
  label?: string;
  contextLabel?: string;
  fieldLabel?: string;
  value: number;
};

type SettingsPayload = {
  production: {
    newFactoryCosts: Record<string, number>;
    upgradeCosts: Record<string, number>;
  };
  countries: Record<string, { initialRawMaterials: number; rawMaterialsPerTurn: number }>;
  global: { baseIncomePerRound: number };
  regions: Record<string, number>;
  government: {
    administrationCost: number;
    ideologyMin: number;
    ideologyMax: number;
    naturalShiftRules: Record<string, IdeologyShiftRule>;
  };
  numericConfig: Record<string, NumericConfigEntry[]>;
  decisionSandbox?: DecisionSandboxPayload;
};

type BudgetFormulaContext = {
  currentPools: {
    domesticMarket: number;
    factory: number;
    governmentFiscal: number;
  };
  domesticWeight: number;
  factoryWeight: number;
  governmentWeight: number;
  effectiveWeight: number;
  domesticCapacity: number | null;
  overseasCapacity: number | null;
  domesticDemand: number | null;
  equilibriumPrice: number | null;
  domesticPriceCeiling: number | null;
  overseasPriceCeiling: number | null;
  marketPriceDrift: number | null;
  policyBudgetSupplement: number;
  displayedGovernmentBudget: number;
  adminCapacity: number;
  adminPurchaseCost: number | null;
  productionModes: Array<{
    mode: string;
    label: string;
    outputRatio: number;
    demandCoefficient: number;
    buildCost: number | null;
    upgradeCost: number | null;
    currentCapacity: number;
    requiredTech: string | string[] | null;
    isAvailable: boolean;
  }>;
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const PRODUCTION_LEVELS: Array<{ key: string; label: string }> = [
  { key: "handicraft", label: `${i18n.t("game:productionRoute.handicraft")} (handicraft)` },
  { key: "mechanized", label: `${i18n.t("game:productionRoute.mechanized")} (mechanized)` },
  { key: "steam", label: `${i18n.t("game:productionRoute.steam")} (steam)` },
  { key: "electrified", label: `${i18n.t("game:productionRoute.electrified")} (electrified)` },
];

const UPGRADABLE_LEVELS = new Set(["mechanized", "steam", "electrified"]);

const COUNTRY_LABELS: Array<{ key: string; label: string }> = [
  { key: "britain", label: i18n.t("game:country.britain") },
  { key: "france", label: i18n.t("game:country.france") },
  { key: "prussia", label: i18n.t("game:country.prussia") },
  { key: "austria", label: i18n.t("game:country.austria") },
  { key: "russia", label: i18n.t("game:country.russia") },
];

const REGION_LABELS: Record<string, string> = {
  europe: i18n.t("game:region.europe"),
  americas: i18n.t("game:region.americas"),
  africa: i18n.t("game:region.africa"),
  middle_east: i18n.t("game:region.middle_east"),
  asia_pacific: i18n.t("game:region.asia_pacific"),
};

const IDEOLOGY_LABELS: Array<{ key: string; label: string }> = [
  { key: "liberalism", label: i18n.t("game:ideology.liberalism") },
  { key: "egalitarianism", label: i18n.t("game:ideology.egalitarianism") },
  { key: "nationalism", label: i18n.t("game:ideology.nationalism") },
];

const CONFIG_FILE_LABELS: Record<string, string> = {
  "abilities.json": i18n.t("pages:settings.configFiles.abilities.json"),
  "countries.json": i18n.t("pages:settings.configFiles.countries.json"),
  "decision_actions.json": i18n.t("pages:settings.configFiles.decision_actions.json"),
  "events.json": i18n.t("pages:settings.configFiles.events.json"),
  "global.json": i18n.t("pages:settings.configFiles.global.json"),
  "market.json": i18n.t("pages:settings.configFiles.market.json"),
  "military.json": i18n.t("pages:settings.configFiles.military.json"),
  "military_actions.json": i18n.t("pages:settings.configFiles.military_actions.json"),
  "politics.json": i18n.t("pages:settings.configFiles.politics.json"),
  "production.json": i18n.t("pages:settings.configFiles.production.json"),
  "reforms.json": i18n.t("pages:settings.configFiles.reforms.json"),
  "regions.json": i18n.t("pages:settings.configFiles.regions.json"),
  "research_actions.json": i18n.t("pages:settings.configFiles.research_actions.json"),
  "technology.json": i18n.t("pages:settings.configFiles.technology.json"),
};

const COVERED_NUMERIC_PATHS = new Set<string>([
  ...PRODUCTION_LEVELS.map(({ key }) => numericPathKey("production.json", ["newFactoryCosts", key])),
  ...Array.from(UPGRADABLE_LEVELS).map((key) => numericPathKey("production.json", ["upgradeCosts", key])),
  ...COUNTRY_LABELS.flatMap(({ key }) => [
    numericPathKey("countries.json", ["countries", key, "initialRawMaterials"]),
    numericPathKey("countries.json", ["countries", key, "rawMaterialsPerTurn"]),
  ]),
  numericPathKey("global.json", ["baseIncomePerRound"]),
  ...Object.keys(REGION_LABELS).map((key, index) => numericPathKey("regions.json", ["regions", index, "priceMultiplier"])),
  numericPathKey("politics.json", ["administrationCost"]),
  numericPathKey("politics.json", ["ideologyMin"]),
  numericPathKey("politics.json", ["ideologyMax"]),
  ...IDEOLOGY_LABELS.flatMap(({ key }) => [
    numericPathKey("politics.json", ["naturalShiftRules", key, "highThreshold"]),
    numericPathKey("politics.json", ["naturalShiftRules", key, "lowThreshold"]),
  ]),
]);

function numericPathKey(fileName: string, path: NumericPathSegment[]): string {
  return `${fileName}:${JSON.stringify(path)}`;
}

function pathsEqual(left: NumericPathSegment[], right: NumericPathSegment[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isCoveredNumericEntry(fileName: string, entry: NumericConfigEntry): boolean {
  return COVERED_NUMERIC_PATHS.has(numericPathKey(fileName, entry.path));
}

function getCoveredNumericValue(
  data: SettingsPayload,
  fileName: string,
  path: NumericPathSegment[],
): number | null {
  if (fileName === "production.json" && path[0] === "newFactoryCosts" && typeof path[1] === "string") {
    return data.production.newFactoryCosts[path[1]] ?? 0;
  }
  if (fileName === "production.json" && path[0] === "upgradeCosts" && typeof path[1] === "string") {
    return data.production.upgradeCosts[path[1]] ?? 0;
  }
  if (fileName === "countries.json" && path[0] === "countries" && typeof path[1] === "string" && (path[2] === "initialRawMaterials" || path[2] === "rawMaterialsPerTurn")) {
    return data.countries[path[1]]?.[path[2]] ?? 0;
  }
  if (fileName === "global.json" && pathsEqual(path, ["baseIncomePerRound"])) {
    return data.global.baseIncomePerRound;
  }
  if (fileName === "regions.json" && path[0] === "regions" && typeof path[1] === "number" && path[2] === "priceMultiplier") {
    const regionKey = Object.keys(REGION_LABELS)[path[1]];
    return regionKey ? data.regions[regionKey] ?? 0 : 0;
  }
  if (fileName === "politics.json" && path[0] === "administrationCost") {
    return data.government.administrationCost;
  }
  if (fileName === "politics.json" && path[0] === "ideologyMin") {
    return data.government.ideologyMin;
  }
  if (fileName === "politics.json" && path[0] === "ideologyMax") {
    return data.government.ideologyMax;
  }
  if (fileName === "politics.json" && path[0] === "naturalShiftRules" && typeof path[1] === "string" && (path[2] === "highThreshold" || path[2] === "lowThreshold")) {
    return data.government.naturalShiftRules[path[1]]?.[path[2]] ?? 0;
  }
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toNumberOrZero(value: unknown): number {
  return toNumberOrNull(value) ?? 0;
}

function formatFormulaNumber(value: number | null): string {
  if (value === null) return "未返回";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function getBudgetFormulaContext(data: SettingsPayload): BudgetFormulaContext {
  const workspace = data.decisionSandbox?.decisionWorkspace;
  const phase1Economy = workspace?.phase1Economy;
  const currentPools = workspace?.baseBudgetPools ?? workspace?.budgetPools ?? {
    domesticMarket: 0,
    factory: 0,
    governmentFiscal: 0,
  };
  const displayedGovernmentBudget = toNumberOrZero(workspace?.budgetPools?.governmentFiscal);
  const baseGovernmentBudget = toNumberOrZero(currentPools.governmentFiscal);
  const domesticWeight = toNumberOrZero(workspace?.incomeAllocationRatio?.domesticMarket);
  const factoryWeight = toNumberOrZero(workspace?.incomeAllocationRatio?.factory);
  const governmentWeight = toNumberOrZero(workspace?.incomeAllocationRatio?.governmentFiscal);

  return {
    currentPools: {
      domesticMarket: toNumberOrZero(currentPools.domesticMarket),
      factory: toNumberOrZero(currentPools.factory),
      governmentFiscal: toNumberOrZero(currentPools.governmentFiscal),
    },
    domesticWeight,
    factoryWeight,
    governmentWeight,
    effectiveWeight: factoryWeight + governmentWeight,
    domesticCapacity: toNumberOrNull(workspace?.domesticMarketCapacity),
    overseasCapacity: toNumberOrNull(workspace?.overseasMarketCapacity),
    domesticDemand: toNumberOrNull(phase1Economy?.domesticDemand),
    equilibriumPrice: toNumberOrNull(phase1Economy?.equilibriumPrice),
    domesticPriceCeiling: toNumberOrNull(phase1Economy?.domesticPriceCeiling),
    overseasPriceCeiling: toNumberOrNull(phase1Economy?.overseasPriceCeiling),
    marketPriceDrift: toNumberOrNull(phase1Economy?.marketPriceDrift),
    policyBudgetSupplement: Math.max(0, displayedGovernmentBudget - baseGovernmentBudget),
    displayedGovernmentBudget,
    adminCapacity: toNumberOrZero(data.decisionSandbox?.playerState.administrationCapacity),
    adminPurchaseCost: toNumberOrNull(workspace?.governmentReforms?.adminPurchaseCost),
    productionModes: (phase1Economy?.productionModes ?? []).map((mode) => ({
      mode: String(mode.mode),
      label: String(mode.label),
      outputRatio: toNumberOrZero(mode.outputRatio),
      demandCoefficient: toNumberOrZero(mode.demandCoefficient),
      buildCost: toNumberOrNull(mode.buildCost),
      upgradeCost: toNumberOrNull(mode.upgradeCost),
      currentCapacity: toNumberOrZero(mode.currentCapacity),
      requiredTech: mode.requiredTech ?? null,
      isAvailable: Boolean(mode.isAvailable),
    })),
  };
}

function FormulaCard({
  title,
  formula,
  explanation,
  details = [],
  examples = [],
  source,
  tone = "default",
}: {
  title: string;
  formula: string[];
  explanation: string;
  details?: string[];
  examples?: string[];
  source: string;
  tone?: "default" | "warning";
}) {
  return (
    <article className={`settings-formula-card settings-formula-card--${tone}`}>
      <h3>{title}</h3>
      <div className="settings-formula-equations">
        {formula.map((line) => (
          <code key={line}>{line}</code>
        ))}
      </div>
      <p>{explanation}</p>
      {details.length > 0 ? (
        <ul className="settings-formula-details">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {examples.length > 0 ? (
        <div className="settings-formula-examples">
          {examples.map((example) => (
            <span key={example}>{example}</span>
          ))}
        </div>
      ) : null}
      <span className="settings-formula-source">{source}</span>
    </article>
  );
}


export function SettingsPage() {
  const { t } = useTranslation("pages");
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;
    apiRequest<SettingsPayload>("/api/v1/settings")
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : i18n.t("common:loadFailed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <PageShell className="settings-page">
        <SectionCard title={t("settings.loadErrorTitle")} tone="muted">
          <p>{t("settings.loadErrorDescription")}: {loadError}</p>
        </SectionCard>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell className="settings-page">
        <SectionCard title={t("settings.loadErrorTitle")} tone="muted">
          <p>{i18n.t("common:loading")}</p>
        </SectionCard>
      </PageShell>
    );
  }

  const updateNewFactoryCost = (key: string, value: number) => {
    setData({
      ...data,
      production: {
        ...data.production,
        newFactoryCosts: { ...data.production.newFactoryCosts, [key]: value },
      },
    });
  };

  const updateUpgradeCost = (key: string, value: number) => {
    setData({
      ...data,
      production: {
        ...data.production,
        upgradeCosts: { ...data.production.upgradeCosts, [key]: value },
      },
    });
  };

  const updateCountry = (
    key: string,
    field: "initialRawMaterials" | "rawMaterialsPerTurn",
    value: number,
  ) => {
    setData({
      ...data,
      countries: {
        ...data.countries,
        [key]: { ...data.countries[key], [field]: value },
      },
    });
  };

  const updateGlobalIncome = (value: number) => {
    setData({ ...data, global: { ...data.global, baseIncomePerRound: value } });
  };

  const updateRegion = (key: string, value: number) => {
    setData({ ...data, regions: { ...data.regions, [key]: value } });
  };

  const updateGovernmentField = (
    field: "administrationCost" | "ideologyMin" | "ideologyMax",
    value: number,
  ) => {
    setData({ ...data, government: { ...data.government, [field]: value } });
  };

  const updateShiftThreshold = (
    ideology: string,
    field: "highThreshold" | "lowThreshold",
    value: number,
  ) => {
    const existing = data.government.naturalShiftRules[ideology] ?? {
      highThreshold: 0,
      lowThreshold: 0,
    };
    setData({
      ...data,
      government: {
        ...data.government,
        naturalShiftRules: {
          ...data.government.naturalShiftRules,
          [ideology]: { ...existing, [field]: value },
        },
      },
    });
  };

  const updateNumericEntry = (fileName: string, path: NumericPathSegment[], value: number) => {
    const entries = data.numericConfig[fileName] ?? [];
    setData({
      ...data,
      numericConfig: {
        ...data.numericConfig,
        [fileName]: entries.map((entry) =>
          JSON.stringify(entry.path) === JSON.stringify(path)
            ? { ...entry, value }
            : entry,
        ),
      },
    });
  };

  const getNumericSourceValue = (source: ParameterBindingSource): number => {
    const coveredValue = getCoveredNumericValue(data, source.fileName, source.path);
    if (coveredValue !== null) {
      return coveredValue;
    }
    const entry = data.numericConfig[source.fileName]?.find((item) => pathsEqual(item.path, source.path));
    return entry?.value ?? source.value;
  };

  const updateNumericSourceValue = (source: ParameterBindingSource, value: number) => {
    if (updateCoveredNumericValue(source.fileName, source.path, value)) {
      return;
    }
    updateNumericEntry(source.fileName, source.path, value);
  };

  const buildSavePayload = (): Omit<SettingsPayload, "decisionSandbox"> => {
    const { decisionSandbox: _decisionSandbox, ...settingsData } = data;
    return {
      ...settingsData,
      numericConfig: Object.fromEntries(
        Object.entries(data.numericConfig).map(([fileName, entries]) => [
          fileName,
          entries.filter((entry) => !isCoveredNumericEntry(fileName, entry)),
        ]),
      ),
    };
  };

  function updateCoveredNumericValue(fileName: string, path: NumericPathSegment[], value: number): boolean {
    if (fileName === "production.json" && path[0] === "newFactoryCosts" && typeof path[1] === "string") {
      updateNewFactoryCost(path[1], value);
      return true;
    }
    if (fileName === "production.json" && path[0] === "upgradeCosts" && typeof path[1] === "string") {
      updateUpgradeCost(path[1], value);
      return true;
    }
    if (fileName === "countries.json" && path[0] === "countries" && typeof path[1] === "string" && (path[2] === "initialRawMaterials" || path[2] === "rawMaterialsPerTurn")) {
      updateCountry(path[1], path[2], value);
      return true;
    }
    if (fileName === "global.json" && pathsEqual(path, ["baseIncomePerRound"])) {
      updateGlobalIncome(value);
      return true;
    }
    if (fileName === "regions.json" && path[0] === "regions" && typeof path[1] === "number" && path[2] === "priceMultiplier") {
      const regionKey = Object.keys(REGION_LABELS)[path[1]];
      if (regionKey) {
        updateRegion(regionKey, value);
        return true;
      }
    }
    if (fileName === "politics.json" && (path[0] === "administrationCost" || path[0] === "ideologyMin" || path[0] === "ideologyMax")) {
      updateGovernmentField(path[0], value);
      return true;
    }
    if (fileName === "politics.json" && path[0] === "naturalShiftRules" && typeof path[1] === "string" && (path[2] === "highThreshold" || path[2] === "lowThreshold")) {
      updateShiftThreshold(path[1], path[2], value);
      return true;
    }
    return false;
  }

  const handleSave = async () => {
    setStatus({ kind: "saving" });
    try {
      await apiRequest("/api/v1/settings", { method: "POST", body: buildSavePayload() });
      setStatus({ kind: "success", message: i18n.t("common:saveSuccess") });
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : i18n.t("common:saveFailed"),
      });
    }
  };

  const budgetFormula = getBudgetFormulaContext(data);

  return (
    <PageShell className="settings-page" width="workbench">
      <SectionCard title="Language / 语言" tone="muted" eyebrow="i18n">
        <LanguageSwitcher />
      </SectionCard>

      <SectionCard
        eyebrow={t("settings.eyebrow")}
        title={t("settings.numericConfigTitle")}
        description={t("settings.numericConfigDescription")}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <PrimaryButton
            disabled={status.kind === "saving"}
            onClick={handleSave}
            type="button"
          >
            {status.kind === "saving" ? t("settings.savingButton") : t("settings.saveButton")}
          </PrimaryButton>
          {status.kind === "success" ? (
            <span style={{ color: "#2f8a4d" }}>{status.message}</span>
          ) : null}
          {status.kind === "error" ? (
            <span style={{ color: "#b8323a" }}>{status.message}</span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        className="settings-parameter-sandbox-card"
        title="参数关系沙盒"
        eyebrow="Decision Sandbox"
        description="复用真实地图和真实决策按钮；点击按钮内的数值关系可以查看并编辑对应配置。这里不会提交真实游戏回合。"
      >
        <DecisionParameterSandbox
          sandbox={data.decisionSandbox}
          getSourceValue={getNumericSourceValue}
          onSourceValueChange={updateNumericSourceValue}
        />
      </SectionCard>

      <SectionCard
        className="settings-budget-formula-card"
        title="市场与预算池公式"
        eyebrow="Market Formula"
        description="这里解释玩家最容易混淆的链路：卖货收入如何变成国家收入，国家收入如何在结算后进入各个预算池。"
      >
        <div className="settings-formula-shell">
          <div className="settings-formula-summary">
            <div>
              <span>当前英国第 1 回合基线</span>
              <strong>
                国内市场 {budgetFormula.currentPools.domesticMarket} · 工厂预算 {budgetFormula.currentPools.factory} · 政府财政 {budgetFormula.currentPools.governmentFiscal}
              </strong>
            </div>
            <div>
              <span>结算有效权重</span>
              <strong>
                工厂 {formatFormulaNumber(budgetFormula.factoryWeight)} + 政府 {formatFormulaNumber(budgetFormula.governmentWeight)} = {formatFormulaNumber(budgetFormula.effectiveWeight)}
              </strong>
            </div>
            <div>
              <span>市场基线</span>
              <strong>
                需求 {formatFormulaNumber(budgetFormula.domesticDemand)} · 均衡价 {formatFormulaNumber(budgetFormula.equilibriumPrice)} · 价格漂移 {formatFormulaNumber(budgetFormula.marketPriceDrift)}
              </strong>
            </div>
          </div>

          <div className="settings-formula-flow" aria-label="市场收入到预算池流程">
            <span>生产库存</span>
            <span>国内/海外出售</span>
            <span>国家收入</span>
            <span>财政结算</span>
            <span>下回合预算池</span>
          </div>

          <div className="settings-rule-book">
            <div>
              <span className="settings-rule-book__eyebrow">策划阅读口径</span>
              <h3>这块不是玩家提示，而是开发交付给策划的真实规则说明。</h3>
              <p>
                用户点击按钮时看到的是“花费”和“效果”；这里解释按钮背后的预算池、市场、生产、政策、军事、研究如何互相影响。
                如果后续调参出现“为什么下回合多了这么多钱”“为什么国内市场没有涨”“为什么政府财政显示值和真实扣款不同”，优先看这一块。
              </p>
            </div>
            <div className="settings-rule-book__notes">
              <strong>当前实现最重要的三个口径</strong>
              <span>国内市场池当前不是收入回流池，市场卖货收入不会按比例进入国内市场池。</span>
              <span>政府财政有“真实财政池”和“决策显示池”两层；每回合 8 点政策专项额度不结转、不存入真实国库。</span>
              <span>工厂升级当轮可用；新建/扩建先进产能进入 pending，结算后才转成下回合真实产能。</span>
            </div>
          </div>

          <div className="settings-production-reference">
            <h3>当前生产档位基线</h3>
            <p>这些数值来自英国第 1 回合沙盒工作区；它们决定生产产出、国内需求、建厂成本和升级前置。</p>
            <div className="settings-production-reference__table-wrap">
              <table className="settings-production-reference__table">
                <thead>
                  <tr>
                    <th>路线</th>
                    <th>当前产能</th>
                    <th>原材料转商品</th>
                    <th>需求系数</th>
                    <th>新建成本</th>
                    <th>升级成本</th>
                    <th>科技前置</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetFormula.productionModes.map((mode) => (
                    <tr key={mode.mode}>
                      <td>{mode.label} <code>{mode.mode}</code></td>
                      <td>{mode.currentCapacity}</td>
                      <td>{mode.outputRatio}x</td>
                      <td>{formatFormulaNumber(mode.demandCoefficient)}</td>
                      <td>{mode.buildCost === null ? "无" : mode.buildCost}</td>
                      <td>{mode.upgradeCost === null ? "无" : mode.upgradeCost}</td>
                      <td>
                        {mode.requiredTech
                          ? Array.isArray(mode.requiredTech) ? mode.requiredTech.join(" + ") : mode.requiredTech
                          : mode.isAvailable ? "无" : "未配置"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="settings-formula-grid">
            <FormulaCard
              title="1. 国家收入"
              formula={[
                "国家收入 = 国内销售收入 + 海外销售收入",
                "国内销售收入 = 国内成交数量 × 国内最终价格",
                "海外销售收入 = Σ(海外成交数量 × 海外单价)",
              ]}
              explanation="市场阶段只负责把卖货结果换成国家收入；这笔钱不会立刻变成可花预算，要等财政结算阶段分账。"
              details={[
                "市场阶段结束时，系统写入 domesticSalesRevenue、overseasSalesRevenue、nationalIncome 三个结果字段。",
                "当前殖民地收入在结算中是 0；控制区域不额外增加国家收入。",
                "国家收入只是本轮待分账收入，不等同于政府财政，也不等同于三个预算池总和。",
              ]}
              examples={[
                "例：国内卖 10 件 × 4 = 40，海外卖 5 件 × 6 = 30，则国家收入 = 70。",
              ]}
              source="backend/app/modules/rules/market.py::_apply_phase1_market"
            />
            <FormulaCard
              title="2. 国内市场 / 民间购买力池"
              formula={[
                "新增国内市场预算 = 0",
                "下回合国内市场预算 = 当前国内市场预算",
              ]}
              explanation="当前 Phase 1 规则里，民间购买力池是国内市场承接力，不是卖货收入回流池；它主要通过政策、事件、改革和容量效果变化。"
              details={[
                "国内市场池仍然存在，可以作为旧版国内市场动作或部分效果的资源字段，但财政结算不会把国家收入分到这里。",
                "国内市场成交量看的是国内容量、需求、库存和玩家投放，不是直接花掉国内市场池。",
                "如果策划希望国内市场池参与回流，需要改结算函数，而不是只改前端文案。",
              ]}
              examples={[
                `当前基线国内市场池 = ${budgetFormula.currentPools.domesticMarket}；即使国家收入为 70，结算新增仍是 0。`,
              ]}
              source="backend/app/modules/rules/settlement.py::_allocate_income_phase1"
              tone="warning"
            />
            <FormulaCard
              title="3. 工厂预算池"
              formula={[
                "有效权重 = 工厂权重 + 政府财政权重",
                "新增工厂预算 = floor(国家收入 × 工厂权重 / 有效权重)",
                "下回合工厂预算 = 当前工厂预算 + 新增工厂预算",
              ]}
              explanation="工厂预算用于下回合生产、工厂增加和产业升级。floor 表示向下取整，所以小数部分不会进入工厂预算。"
              details={[
                "结算时会忽略 domesticMarket 权重，只拿 factory 和 governmentFiscal 两个权重计算有效权重。",
                "工厂预算新增使用向下取整，余数不会丢失，而是由政府财政承接。",
                "工厂预算会被生产投料、工厂增加、新建工厂、产业升级、工厂行动共同消耗。",
              ]}
              examples={[
                `当前有效权重 = ${formatFormulaNumber(budgetFormula.factoryWeight)} + ${formatFormulaNumber(budgetFormula.governmentWeight)} = ${formatFormulaNumber(budgetFormula.effectiveWeight)}。`,
                "例：国家收入 51，工厂权重 3，政府权重 3，则工厂新增 floor(51×3/6)=25，政府新增 26。",
              ]}
              source="backend/app/modules/rules/settlement.py::_allocate_income_phase1"
            />
            <FormulaCard
              title="4. 政府财政池"
              formula={[
                "新增政府财政 = 国家收入 - 新增工厂预算",
                "下回合政府财政 = 当前政府财政 + 新增政府财政",
              ]}
              explanation="政府财政用于购买行政力、政策、军事和研究。政府财政吃掉取整后的余数，因此工厂预算 + 政府财政一定等于国家收入。政策专项额度只影响政策可用上限，不并入政府财政池。"
              details={[
                "政府财政新增 = 国家收入 - 工厂新增，所以分账余数一定落到政府财政。",
                "政府财政真实池跨回合保留；政策专项额度是决策阶段临时显示和抵扣额度，不会进入这个真实池。",
                "行政力购买、政府策略、政策激活、军事行动、外交、研究设施都可能消耗政府财政。",
              ]}
              examples={[
                "例：国家收入 51，工厂新增 25，则政府财政新增 26；不是 25.5，也不是四舍五入。",
              ]}
              source="backend/app/modules/rules/settlement.py::_allocate_income_phase1"
            />
            <FormulaCard
              title="5. 国内成交与价格"
              formula={[
                "国内成交 = min(投放量, 库存, 国内需求, 国内容量)",
                "国内需求 = Σ(各路线产能 × 需求系数)",
                "国内最终价格 = clamp(供需浮动价 + 国内价格加成, 1, 国内价格上限)",
              ]}
              explanation={`当前基线：国内容量 ${formatFormulaNumber(budgetFormula.domesticCapacity)}，国内需求 ${formatFormulaNumber(budgetFormula.domesticDemand)}，国内价格上限 ${formatFormulaNumber(budgetFormula.domesticPriceCeiling)}。`}
              details={[
                "均衡价当前为 3；如果有价格漂移，则先执行 max(1, 3 + priceDrift)。",
                "供给少于需求时，价格按短缺率上浮；供给多于需求时，价格按过剩率下调，但下调倍率最低 0.5。",
                "提交校验会把国内需求转成整数口径，因此小数需求可能被截断。",
              ]}
              examples={[
                "例：库存 20、投放 12、需求 8.5、国内容量 10，则国内成交最多是 8.5，提交侧通常按 8 检查。",
              ]}
              source="backend/app/modules/rules/market.py::_apply_phase1_market"
            />
            <FormulaCard
              title="6. 海外成交与价格"
              formula={[
                "海外成交受库存、海外容量、区域准入、路线可达性和竞争奖励限制",
                "海外单价 = clamp(floor(均衡价 × 区域倍率) + 海外价格加成 + 竞争价格奖励, 1, 海外价格上限)",
              ]}
              explanation={`当前基线：海外容量 ${formatFormulaNumber(budgetFormula.overseasCapacity)}，海外价格上限 ${formatFormulaNumber(budgetFormula.overseasPriceCeiling)}。区域倍率在下方市场参数表可编辑。`}
              details={[
                "海外容量是共享池，不是每个区域各有一套容量；普通海外销售会扣共享海外容量。",
                "特许区域需要外交建交；被其他国家海军封锁的航线不能销售、建交或参与市场竞争。",
                "市场竞争胜者可拿额外容量和额外价格奖励；奖励容量优先成交，不消耗普通海外容量。",
              ]}
              examples={[
                "区域倍率例：均衡价 3，非洲倍率 1.2，则基础海外单价 int(3×1.2)=3。",
              ]}
              source="backend/app/modules/rules/market.py::_apply_phase1_market"
            />
            <FormulaCard
              title="7. 下回合价格漂移"
              formula={[
                "总销量 > 需求阈值：下回合价格漂移下降",
                "总销量 < 需求阈值：下回合价格漂移上升",
                "总销量 = 需求阈值：价格漂移不变",
              ]}
              explanation="价格漂移会改变下回合的均衡价。销量太少代表供给没有被市场吃掉，系统会提高价格漂移；销量太多代表市场吃紧，系统会压低价格漂移。"
              details={[
                "价格漂移在财政结算阶段更新，下一轮市场阶段才生效。",
                "当前统一商品 demandThreshold = 40，domesticReferencePrice = 5，priceFloor = 2，priceCeiling = 12。",
                "当前手工业路线 adjustmentStep = 1；机械化、蒸汽、电气路线的 step 为 2。",
              ]}
              examples={[
                "当前统一商品漂移边界：min = 2 - 5 = -3，max = 12 - 5 = 7。",
              ]}
              source="backend/app/modules/rules/settlement.py::_build_market_price_adjustments"
            />
            <FormulaCard
              title="8. 政策专项额度与行政力"
              formula={[
                "政策专项额度 = 决策阶段显示政府财政 - 真实政府财政池",
                "真实政府财政超支检查 = 总决策财政支出 - 可用政策专项额度 <= 真实政府财政池",
                "行政力本回合可用 = 行政力上限 + 本回合购买 - 已排队改革消耗 - 已激活政策占用",
              ]}
              explanation={`当前基线：显示政府财政 ${budgetFormula.displayedGovernmentBudget}，真实政府财政池 ${budgetFormula.currentPools.governmentFiscal}，政策专项额度 ${budgetFormula.policyBudgetSupplement}；行政力上限 ${budgetFormula.adminCapacity}，购买 1 点行政力成本 ${formatFormulaNumber(budgetFormula.adminPurchaseCost)}。政策专项额度和行政力是决策阶段资源，不参与卖货收入分账。`}
              details={[
                "当前 8 点专项额度会优先抵扣本轮政府、市场政策、行政力购买、政策激活、军事和外交支出；它不是只给 regular policy 用。",
                "购买行政力会永久增加 baseAdminCapacity，并且本回合立刻可用。",
                "改革消耗 baseAdminCapacity，是永久消耗；regular policy 占用 administrationCapacity，本轮结算后返还。",
                "政策效果中 administrationCapacityDelta、armyCapDelta、domesticMarketCapacityDelta、overseasMarketCapacityDelta、productionCapacityDelta 等容量/上限类会永久留下；ratioDelta 和多数收入分配效果只影响本轮。",
              ]}
              examples={[
                "例：真实财政 10，专项 8，本轮花 10，则真实财政只扣 2；花 18 才扣完真实财政 10；花 19 会被拒绝。",
              ]}
              source="backend/app/modules/game_state/budgeting.py · frontend/src/features/game/decisionShared.ts"
              tone="warning"
            />
            <FormulaCard
              title="9. 工厂增加与产业升级"
              formula={[
                "新建工厂：pendingProductionCapacity[target] += 2，下回合生效",
                "扩建工厂：pendingProductionCapacity[current] += 1，下回合生效",
                "产业升级：sourceCapacity -= quantity，targetCapacity += quantity，当轮生效",
              ]}
              explanation="工厂增加是扩大某一工业阶段的总产能；产业升级是把上一阶段产能转化为下一阶段产能。两者都花工厂预算，但生效时点不同。"
              details={[
                "当前升级链是 handicraft -> mechanized -> steam -> electrified，不支持跨级跳转。",
                "机械化需要 spinning_jenny；蒸汽需要 watt_engine + lathe；电气需要 power_generation + combustion_engine。",
                "升级在生产投料前执行，所以升级后的高级产能本回合可以参与生产；新建/扩建要等结算后转正。",
                "政策或改革也可能通过 productionCapacityDelta 直接给产能，这类容量效果通常永久生效。",
              ]}
              examples={[
                "例：把 2 点手工业升级到机械化，本回合手工业 -2、机械化 +2，并且这 2 点机械化本回合可生产。",
              ]}
              source="backend/app/modules/rules/decision.py::_apply_phase1_production_plan · production.json · technology.json"
            />
            <FormulaCard
              title="10. 生产投料与商品产出"
              formula={[
                "可投料 <= min(原材料, 单路线产能, 总投料产能, 工厂预算)",
                "商品产出 = Σ(各路线投料 × 路线产出倍率) × 临时产出倍率 × 天赋百分比",
                "投料成本 = 投料原材料数量 × 统一商品单位预算成本",
              ]}
              explanation="生产不是自动把所有原材料变成商品；玩家的投料同时受原材料、路线产能、总产能和工厂预算四个瓶颈限制。"
              details={[
                "当前统一商品单位预算成本为 1，即每投 1 原材料消耗 1 工厂预算。",
                "手工业产出 1x，机械化 2x，蒸汽 4x，电气 8x；高级路线会显著放大同样原材料的商品产出。",
                "factory_overtime_shift 等效果可以临时提高产出倍率；factory_raw_procurement 可以花工厂预算立刻补原材料。",
              ]}
              examples={[
                "例：蒸汽路线投 3 原材料，基础商品产出 = 3 × 4 = 12。",
              ]}
              source="backend/app/modules/rules/decision.py::_apply_phase1_production_plan · phase1_economy.py"
            />
            <FormulaCard
              title="11. 军事、外交与海外市场"
              formula={[
                "军事/外交支出走政府财政决策额度",
                "海外容量 = baseOverseasCapacity + overseasMarketCapacityBonus",
                "海军封锁：最高舰队数 >= 阈值 且严格高于第二名",
              ]}
              explanation="军事当前主要服务海外市场：增加海外容量、建立外交准入、控制航路封锁、争夺市场竞争奖励。"
              details={[
                "征募陆军增加 army，但受 armyCap 限制；扩充军队等政策可永久提高 armyCap。",
                "海军演练会永久提高海外市场承接上限；建造舰队增加可部署舰队。",
                "外交建交每个区域只需一次，常用于解锁 concession 区域销售。",
                "当前殖民/征服链基本已被移除或置空，不应再按殖民收入理解军事收益。",
              ]}
              examples={[
                "例：被其他国家封锁到目标区域的 requiredNodes 后，该区域海外销售、外交建交、市场竞争都会被阻断。",
              ]}
              source="backend/config/balance/military_actions.json · backend/app/modules/rules/route_utils.py"
            />
            <FormulaCard
              title="12. 研究设施、科技与解锁"
              formula={[
                "研究进度/轮 = 研究设施总数 × 每设施进度",
                "达到阈值后首发现者掷 D10：roll >= effectiveThreshold 成功",
                "失败后 breakthroughAttempts +1，下次 effectiveThreshold -1",
              ]}
              explanation="研究是把政府财政转化为工业路线解锁的长期系统；科技不会直接给钱，但会打开更高级的工厂新建和产业升级路径。"
              details={[
                "建研究院花政府财政；设置研究目标本身免费，只写 activeResearch。",
                "主线科技顺序是 spinning_jenny -> lathe -> watt_engine -> power_generation -> combustion_engine。",
                "如果其他国家已经首发现，后续国家达到原始阈值即可解锁，不再掷骰。",
                "科技解锁会被工厂模块检查；缺科技时高级路线不可新建或升级。",
              ]}
              examples={[
                "例：2 个研究设施、每设施进度 1，则每轮给 activeResearch +2 进度。",
              ]}
              source="backend/config/balance/technology.json · backend/app/modules/rules/settlement.py::_apply_phase3_research_progress"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("settings.productionCost.title")} eyebrow={t("settings.productionCost.eyebrow")}>
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("settings.productionCost.routeColumn")}</th>
              <th>{t("settings.productionCost.newCostColumn")}</th>
              <th>{t("settings.productionCost.upgradeCostColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTION_LEVELS.map(({ key, label }) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={data.production.newFactoryCosts[key] ?? 0}
                    onChange={(event) =>
                      updateNewFactoryCost(key, Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  {UPGRADABLE_LEVELS.has(key) ? (
                    <input
                      type="number"
                      min={0}
                      value={data.production.upgradeCosts[key] ?? 0}
                      onChange={(event) =>
                        updateUpgradeCost(key, Number(event.target.value))
                      }
                    />
                  ) : (
                    <span style={{ color: "#888" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={t("settings.rawMaterials.title")} eyebrow={t("settings.rawMaterials.eyebrow")}>
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("settings.rawMaterials.countryColumn")}</th>
              <th>{t("settings.rawMaterials.initialColumn")}</th>
              <th>{t("settings.rawMaterials.perTurnColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {COUNTRY_LABELS.map(({ key, label }) => {
              const country = data.countries[key];
              if (!country) return null;
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={country.initialRawMaterials}
                      onChange={(event) =>
                        updateCountry(key, "initialRawMaterials", Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={country.rawMaterialsPerTurn}
                      onChange={(event) =>
                        updateCountry(key, "rawMaterialsPerTurn", Number(event.target.value))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={t("settings.market.title")} eyebrow={t("settings.market.eyebrow")}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span>{t("settings.market.baseIncomeLabel")}</span>
            <input
              type="number"
              min={0}
              value={data.global.baseIncomePerRound}
              onChange={(event) => updateGlobalIncome(Number(event.target.value))}
            />
          </label>
        </div>
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("settings.market.regionColumn")}</th>
              <th>{t("settings.market.priceMultiplierColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.regions).map(([key, multiplier]) => (
              <tr key={key}>
                <td>{REGION_LABELS[key] ?? key}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={multiplier}
                    onChange={(event) => updateRegion(key, Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard title={t("settings.government.title")} eyebrow={t("settings.government.eyebrow")}>
        <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span>{t("settings.government.adminCostLabel")}</span>
            <input
              type="number"
              min={0}
              value={data.government.administrationCost}
              onChange={(event) =>
                updateGovernmentField("administrationCost", Number(event.target.value))
              }
            />
          </label>
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span>{t("settings.government.ideologyMinLabel")}</span>
            <input
              type="number"
              value={data.government.ideologyMin}
              onChange={(event) =>
                updateGovernmentField("ideologyMin", Number(event.target.value))
              }
            />
            <span>{t("settings.government.ideologyMaxLabel")}</span>
            <input
              type="number"
              value={data.government.ideologyMax}
              onChange={(event) =>
                updateGovernmentField("ideologyMax", Number(event.target.value))
              }
            />
          </label>
        </div>
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("settings.government.thresholdColumns.ideology")}</th>
              <th>{t("settings.government.thresholdColumns.highThreshold")}</th>
              <th>{t("settings.government.thresholdColumns.lowThreshold")}</th>
            </tr>
          </thead>
          <tbody>
            {IDEOLOGY_LABELS.map(({ key, label }) => {
              const rule = data.government.naturalShiftRules[key];
              if (!rule) return null;
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <input
                      type="number"
                      value={rule.highThreshold}
                      onChange={(event) =>
                        updateShiftThreshold(key, "highThreshold", Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={rule.lowThreshold}
                      onChange={(event) =>
                        updateShiftThreshold(key, "lowThreshold", Number(event.target.value))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        title={t("settings.allJsonValuesTitle")}
        eyebrow={t("settings.allJsonValuesEyebrow")}
        description={t("settings.allJsonValuesDescription")}
      >
        {Object.entries(data.numericConfig).map(([fileName, entries]) => {
          const visibleEntries = entries.filter((entry) => !isCoveredNumericEntry(fileName, entry));
          if (visibleEntries.length === 0) {
            return null;
          }
          return (
            <div key={fileName} style={{ marginBottom: "24px" }}>
              <h3 style={{ marginBottom: "10px", fontSize: 18 }}>
                {CONFIG_FILE_LABELS[fileName] ?? fileName}
                <span style={{ marginLeft: 8, color: "#888", fontSize: 13, fontFamily: "var(--font-sans)" }}>
                  {fileName}
                </span>
              </h3>
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>{t("settings.jsonValueColumns.name")}</th>
                    <th>{t("settings.jsonValueColumns.value")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => (
                    <tr key={`${fileName}:${entry.pathLabel}`}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {entry.label ?? entry.fieldLabel ?? entry.pathLabel}
                        </div>
                        <code style={{ color: "#777", fontSize: 12 }}>{entry.pathLabel}</code>
                      </td>
                      <td>
                        <input
                          type="number"
                          step={Number.isInteger(entry.value) ? 1 : 0.1}
                          value={entry.value}
                          onChange={(event) =>
                            updateNumericEntry(fileName, entry.path, Number(event.target.value))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </SectionCard>
    </PageShell>
  );
}
