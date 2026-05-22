import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "../components/i18n/LanguageSwitcher";
import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { DecisionParameterSandbox, type DecisionSandboxPayload } from "../components/settings/DecisionParameterSandbox";
import type { ParameterBindingSource } from "../features/game/parameterInspector";
import {
  DOMESTIC_PRICE_CEILING_RATIO,
  DOMESTIC_PRICE_FLOOR_RATIO,
} from "../features/game/marketMath";
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
    expansionCosts: Record<string, number>;
    newFactoryCosts: Record<string, number>;
    upgradeCosts: Record<string, number>;
    rawMaterialPurchaseUnitCost: number;
  };
  countries: Record<string, {
    initialRawMaterials: number;
    rawMaterialsPerTurn: number;
    factoryTotalCap: number;
    factoryCapsByMode: Record<string, number>;
    materialPurchaseCapPerTurn: number;
  }>;
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
  minimumDomesticPrice: number | null;
  maximumDomesticPrice: number | null;
  marketPriceDrift: number | null;
  adminCapacity: number;
  adminPurchaseCost: number | null;
  productionModes: Array<{
    mode: string;
    label: string;
    outputRatio: number;
    demandCoefficient: number;
    expansionCost: number | null;
    upgradeCost: number | null;
    currentCapacity: number;
    factoryCap: number | null;
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

const UPGRADABLE_LEVELS = new Set(["handicraft", "mechanized", "steam", "electrified"]);

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

const TECH_LABELS: Record<string, string> = {
  spinning_jenny: "珍妮纺纱机",
  lathe: "车床",
  watt_engine: "瓦特蒸汽机",
  power_generation: "发电技术",
  combustion_engine: "内燃机",
};

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
  ...PRODUCTION_LEVELS.map(({ key }) => numericPathKey("production.json", ["expansionCosts", key])),
  ...PRODUCTION_LEVELS.map(({ key }) => numericPathKey("production.json", ["newFactoryCosts", key])),
  ...Array.from(UPGRADABLE_LEVELS).map((key) => numericPathKey("production.json", ["upgradeCosts", key])),
  numericPathKey("production.json", ["rawMaterialPurchaseUnitCost"]),
  ...COUNTRY_LABELS.flatMap(({ key }) => [
    numericPathKey("countries.json", ["countries", key, "initialRawMaterials"]),
    numericPathKey("countries.json", ["countries", key, "rawMaterialsPerTurn"]),
    numericPathKey("countries.json", ["countries", key, "factoryTotalCap"]),
    numericPathKey("countries.json", ["countries", key, "materialPurchaseCapPerTurn"]),
    ...PRODUCTION_LEVELS.map((level) => numericPathKey("countries.json", ["countries", key, "factoryCapsByMode", level.key])),
  ]),
  numericPathKey("global.json", ["baseIncomePerRound"]),
  ...Object.keys(REGION_LABELS).map((key, index) => numericPathKey("regions.json", ["regions", index, "fixedOverseasPrice"])),
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
  if (fileName === "production.json" && path[0] === "expansionCosts" && typeof path[1] === "string") {
    return data.production.expansionCosts[path[1]] ?? 0;
  }
  if (fileName === "production.json" && path[0] === "newFactoryCosts" && typeof path[1] === "string") {
    return data.production.newFactoryCosts[path[1]] ?? 0;
  }
  if (fileName === "production.json" && path[0] === "upgradeCosts" && typeof path[1] === "string") {
    return data.production.upgradeCosts[path[1]] ?? 0;
  }
  if (fileName === "production.json" && pathsEqual(path, ["rawMaterialPurchaseUnitCost"])) {
    return data.production.rawMaterialPurchaseUnitCost;
  }
  if (fileName === "countries.json" && path[0] === "countries" && typeof path[1] === "string") {
    if (path[2] === "initialRawMaterials" || path[2] === "rawMaterialsPerTurn" || path[2] === "factoryTotalCap" || path[2] === "materialPurchaseCapPerTurn") {
      return data.countries[path[1]]?.[path[2]] ?? 0;
    }
    if (path[2] === "factoryCapsByMode" && typeof path[3] === "string") {
      return data.countries[path[1]]?.factoryCapsByMode?.[path[3]] ?? 0;
    }
  }
  if (fileName === "global.json" && pathsEqual(path, ["baseIncomePerRound"])) {
    return data.global.baseIncomePerRound;
  }
  if (fileName === "regions.json" && path[0] === "regions" && typeof path[1] === "number" && path[2] === "fixedOverseasPrice") {
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

function formatTechRequirement(value: string | string[] | null): string {
  if (!value) return "无";
  const techIds = Array.isArray(value) ? value : [value];
  return techIds.map((techId) => TECH_LABELS[techId] ?? techId).join(" + ");
}

function getBudgetFormulaContext(data: SettingsPayload): BudgetFormulaContext {
  const workspace = data.decisionSandbox?.decisionWorkspace;
  const phase1Economy = workspace?.phase1Economy;
  const currentPools = workspace?.baseBudgetPools ?? workspace?.budgetPools ?? {
    domesticMarket: 0,
    factory: 0,
    governmentFiscal: 0,
  };
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
    effectiveWeight: domesticWeight + factoryWeight + governmentWeight,
    domesticCapacity: toNumberOrNull(phase1Economy?.domesticSoftCap ?? workspace?.domesticMarketCapacity),
    overseasCapacity: toNumberOrNull(workspace?.overseasMarketCapacity),
    domesticDemand: toNumberOrNull(phase1Economy?.domesticDemand),
    equilibriumPrice: toNumberOrNull(phase1Economy?.equilibriumPrice),
    minimumDomesticPrice: toNumberOrNull(
      phase1Economy?.minimumDomesticPrice
        ?? (phase1Economy?.equilibriumPrice == null
          ? null
          : phase1Economy.equilibriumPrice * DOMESTIC_PRICE_FLOOR_RATIO),
    ),
    maximumDomesticPrice: toNumberOrNull(
      phase1Economy?.domesticPriceCeiling
        ?? (phase1Economy?.equilibriumPrice == null
          ? null
          : phase1Economy.equilibriumPrice * DOMESTIC_PRICE_CEILING_RATIO),
    ),
    marketPriceDrift: toNumberOrNull(phase1Economy?.marketPriceDrift),
    adminCapacity: toNumberOrZero(data.decisionSandbox?.playerState.administrationCapacity),
    adminPurchaseCost: toNumberOrNull(workspace?.governmentReforms?.adminPurchaseCost),
    productionModes: (phase1Economy?.productionModes ?? []).map((mode) => ({
      mode: String(mode.mode),
      label: String(mode.label),
      outputRatio: toNumberOrZero(mode.outputRatio),
      demandCoefficient: toNumberOrZero(mode.demandCoefficient),
      expansionCost: toNumberOrNull(mode.buildCost),
      upgradeCost: toNumberOrNull(mode.upgradeCost),
      currentCapacity: toNumberOrZero(mode.currentCapacity),
      factoryCap: toNumberOrNull(mode.factoryCap),
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
      <span className="settings-formula-source">规则位置：{source}</span>
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

  const updateExpansionCost = (key: string, value: number) => {
    setData({
      ...data,
      production: {
        ...data.production,
        expansionCosts: { ...data.production.expansionCosts, [key]: value },
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

  const updateRawMaterialPurchaseUnitCost = (value: number) => {
    setData({
      ...data,
      production: {
        ...data.production,
        rawMaterialPurchaseUnitCost: value,
      },
    });
  };

  const updateCountry = (
    key: string,
    field: "initialRawMaterials" | "rawMaterialsPerTurn" | "factoryTotalCap" | "materialPurchaseCapPerTurn",
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

  const updateCountryFactoryModeCap = (countryKey: string, modeKey: string, value: number) => {
    const country = data.countries[countryKey];
    if (!country) return;
    setData({
      ...data,
      countries: {
        ...data.countries,
        [countryKey]: {
          ...country,
          factoryCapsByMode: {
            ...country.factoryCapsByMode,
            [modeKey]: value,
          },
        },
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
      production: {
        ...settingsData.production,
        newFactoryCosts: { ...settingsData.production.expansionCosts },
      },
      numericConfig: Object.fromEntries(
        Object.entries(data.numericConfig).map(([fileName, entries]) => [
          fileName,
          entries.filter((entry) => !isCoveredNumericEntry(fileName, entry)),
        ]),
      ),
    };
  };

  function updateCoveredNumericValue(fileName: string, path: NumericPathSegment[], value: number): boolean {
    if (fileName === "production.json" && path[0] === "expansionCosts" && typeof path[1] === "string") {
      updateExpansionCost(path[1], value);
      return true;
    }
    if (fileName === "production.json" && path[0] === "newFactoryCosts" && typeof path[1] === "string") {
      updateExpansionCost(path[1], value);
      return true;
    }
    if (fileName === "production.json" && path[0] === "upgradeCosts" && typeof path[1] === "string") {
      updateUpgradeCost(path[1], value);
      return true;
    }
    if (fileName === "production.json" && pathsEqual(path, ["rawMaterialPurchaseUnitCost"])) {
      updateRawMaterialPurchaseUnitCost(value);
      return true;
    }
    if (fileName === "countries.json" && path[0] === "countries" && typeof path[1] === "string") {
      if (path[2] === "initialRawMaterials" || path[2] === "rawMaterialsPerTurn" || path[2] === "factoryTotalCap" || path[2] === "materialPurchaseCapPerTurn") {
        updateCountry(path[1], path[2], value);
        return true;
      }
      if (path[2] === "factoryCapsByMode" && typeof path[3] === "string") {
        updateCountryFactoryModeCap(path[1], path[3], value);
        return true;
      }
    }
    if (fileName === "global.json" && pathsEqual(path, ["baseIncomePerRound"])) {
      updateGlobalIncome(value);
      return true;
    }
    if (fileName === "regions.json" && path[0] === "regions" && typeof path[1] === "number" && path[2] === "fixedOverseasPrice") {
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
                如果后续调参出现“为什么下回合多了这么多钱”“为什么国内市场没有涨”“为什么政府财政不够用”，优先看这一块。
              </p>
            </div>
            <div className="settings-rule-book__notes">
              <strong>当前实现最重要的三个口径</strong>
              <span>国内市场池当前不是收入回流池，市场卖货收入不会按比例进入国内市场池。</span>
              <span>政府财政只有一个池子；政策、军事、研究和行政力购买都从同一政府财政中扣除。</span>
              <span>扩建会直接建设目标类型工厂并本回合生效；升级是逐级转换，不增加总工厂数。</span>
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
                    <th>扩建成本</th>
                    <th>升级成本</th>
                    <th>科技前置</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetFormula.productionModes.map((mode) => (
                    <tr key={mode.mode}>
                      <td>{mode.label}</td>
                      <td>{mode.currentCapacity}</td>
                      <td>{mode.outputRatio}x</td>
                      <td>{formatFormulaNumber(mode.demandCoefficient)}</td>
                      <td>{mode.expansionCost === null ? "无" : mode.expansionCost}</td>
                      <td>{mode.upgradeCost === null ? "无" : mode.upgradeCost}</td>
                      <td>
                        {formatTechRequirement(mode.requiredTech)}
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
                "市场阶段结束时，系统会记录国内销售额、海外销售额和国家收入三个结果。",
                "当前殖民地收入在结算中是 0；控制区域不额外增加国家收入。",
                "国家收入只是本轮待分账收入，不等同于政府财政，也不等同于三个预算池总和。",
              ]}
              examples={[
                "例：国内卖 10 件 × 4 = 40，海外卖 5 件 × 6 = 30，则国家收入 = 70。",
              ]}
              source="市场出售结算"
            />
            <FormulaCard
              title="2. 国内市场 / 民间购买力池"
              formula={[
                "新增国内市场预算 = 向下取整(国家收入 × 国内市场权重 / 总权重)",
                "下回合国内市场预算 = 当前国内市场预算 + 新增国内市场预算",
              ]}
              explanation="民间购买力池既是国内均衡价的资金来源，也是国家收入按 3:3:4 回流后的消费侧预算。"
              details={[
                "国内市场池不会在市场阶段被直接扣花掉；它作为消费池资金参与 P0 = C / K 的定价。",
                "财政结算会把国家收入按当前三池权重分回民间购买力、工厂预算和政府财政。",
                "默认权重为 3:3:4；政策如果改变分配比例，仍走同一套权重字段。",
              ]}
              examples={[
                `当前基线国内市场池 = ${budgetFormula.currentPools.domesticMarket}；国家收入 70 且权重 3:3:4 时，国内市场新增 21。`,
              ]}
              source="财政结算分账"
            />
            <FormulaCard
              title="3. 工厂预算池"
              formula={[
                "总权重 = 国内市场权重 + 工厂权重 + 政府财政权重",
                "新增工厂预算 = 向下取整(国家收入 × 工厂权重 / 总权重)",
                "下回合工厂预算 = 当前工厂预算 + 新增工厂预算",
              ]}
              explanation="工厂预算用于下回合生产、工厂增加和产业升级。这里使用向下取整，所以小数部分不会进入工厂预算。"
              details={[
                "结算时三个预算池都参与分账，国内市场权重不再被冻结或忽略。",
                "工厂预算新增使用向下取整，余数不会丢失，而是由政府财政承接。",
                "工厂预算会被生产投料、扩建、产业升级、工厂行动共同消耗。",
              ]}
              examples={[
                `当前总权重 = ${formatFormulaNumber(budgetFormula.domesticWeight)} + ${formatFormulaNumber(budgetFormula.factoryWeight)} + ${formatFormulaNumber(budgetFormula.governmentWeight)} = ${formatFormulaNumber(budgetFormula.effectiveWeight)}。`,
                "例：国家收入 51，权重 3:3:4，则国内新增 15，工厂新增 15，政府新增 21。",
              ]}
              source="财政结算分账"
            />
            <FormulaCard
              title="4. 政府财政池"
              formula={[
                "新增政府财政 = 国家收入 - 新增国内市场预算 - 新增工厂预算",
                "下回合政府财政 = 当前政府财政 + 新增政府财政",
              ]}
              explanation="政府财政用于购买行政力、政策、军事和研究。政府财政吃掉取整后的余数，因此三池新增之和一定等于国家收入。"
              details={[
                "政府财政新增 = 国家收入 - 国内市场新增 - 工厂新增，所以分账余数一定落到政府财政。",
                "政府财政跨回合保留；本回合政府相关支出直接从这个池子扣除。",
                "行政力购买、政府策略、政策激活、军事行动、研究设施都可能消耗政府财政。",
              ]}
              examples={[
                "例：国家收入 51，国内新增 15，工厂新增 15，则政府财政新增 21。",
              ]}
              source="财政结算分账"
            />
            <FormulaCard
              title="5. 国内成交与价格"
              formula={[
                "国内成交 = min(投放量, 库存)",
                "国内需求 = Σ(各路线产能 × 需求系数)",
                "K = max(1, 国内需求 + 国内容量修正)",
                "P0 = 民间购买力池 / K",
                "价格下限 = 0.1 × P0，价格上限 = 2 × P0",
                "国内最终价格 = clamp(P0 × (2 - 投放量 / K) + 国内价格加成, 0.1 × P0, 2 × P0)",
              ]}
              explanation={`当前基线：定价软上限 ${formatFormulaNumber(budgetFormula.domesticCapacity)}，国内需求 ${formatFormulaNumber(budgetFormula.domesticDemand)}，均衡价 ${formatFormulaNumber(budgetFormula.equilibriumPrice)}，最低价 ${formatFormulaNumber(budgetFormula.minimumDomesticPrice)}，最高价 ${formatFormulaNumber(budgetFormula.maximumDomesticPrice)}。`}
              details={[
                "国内软上限只影响价格，不再作为出售硬上限。",
                "供给少于 K 时，价格按短缺率上浮；供给超过 K 时，价格按过剩率线性下调。",
                "下回合价格不再使用额外漂移字段；收入回流到民间购买力后，会自然改变下一轮 P0。",
                "旧 priceFloor / priceCeiling 字段只作为兼容配置保留，不参与当前 Phase 1 国内结算。",
              ]}
              examples={[
                "例：民间购买力 40、K=10、投放 15，则 P0=4，单价=clamp(4×(2-1.5), 0.4, 8)=2，国内收入=30。",
              ]}
              source="国内市场出售"
            />
            <FormulaCard
              title="6. 海外成交与价格"
              formula={[
                "海外成交受库存、共享海外容量、路线可达性和竞争奖励限制",
                "海外收入 = 成交量 × 区域固定价",
                "区域固定价：欧洲 8，美洲 7，亚太 6，中东 5，非洲 4",
              ]}
              explanation={`当前基线：海外容量 ${formatFormulaNumber(budgetFormula.overseasCapacity)}。海外价格不再跟随均衡价、倍率或竞争奖励浮动。`}
              details={[
                "海外容量是共享池，不是每个区域各有一套容量；普通海外销售会扣共享海外容量。",
                "海外区域默认开放；被其他国家舰队封锁的地区不能销售或参与市场竞争。",
                "市场竞争胜者只增加 2 点额外可售容量；奖励容量优先成交，不消耗普通海外容量，不提高价格。",
              ]}
              examples={[
                "例：向非洲成交 3 件，固定价 4，则海外收入 = 3 × 4 = 12。",
              ]}
              source="海外市场出售"
            />
            <FormulaCard
              title="7. 跨回合价格反馈"
              formula={[
                "下回合均衡价 = 下回合民间购买力池 / 下回合 K",
                "本轮不再写入额外价格漂移字段",
                "过剩或短缺通过本轮收入和下回合消费池自然反馈",
              ]}
              explanation="市场重构后，Phase 1 国内价格不再使用 demandThreshold/priceDrift 的旧记忆逻辑。价格跨回合变化来自预算分配和产能结构变化。"
              details={[
                "民间购买力越高，下一回合 P0 越高；软上限 K 越高，P0 会被摊薄。",
                "扩大内需容量会提高可承接量，但也可能降低均衡单价，需要靠销量和收入抵消。",
                "旧 priceCeiling 字段只作为兼容配置保留，不参与当前 Phase 1 国内结算。",
              ]}
              examples={[
                "例：下回合民间购买力 55、K=11，则均衡价 P0=5。",
              ]}
              source="跨回合价格反馈"
            />
            <FormulaCard
              title="8. 政府财政与行政力"
              formula={[
                "政府财政超支检查 = 总决策财政支出 <= 当前政府财政",
                "行政力本回合可用 = 行政力上限 + 本回合购买 - 改革消耗 - 政策占用",
              ]}
              explanation={`当前基线：政府财政 ${budgetFormula.currentPools.governmentFiscal}；行政力上限 ${budgetFormula.adminCapacity}，购买 1 点行政力成本 ${formatFormulaNumber(budgetFormula.adminPurchaseCost)}。行政力是决策阶段约束，不参与卖货收入分账。`}
              details={[
                "政府、市场政策、行政力购买、政策激活和军事支出都共用政府财政。",
                "购买行政力会永久增加行政力上限，并且本回合立刻可用。",
                "改革消耗行政力上限，是永久消耗；激活政策只是占用本回合行政力，本轮结算后返还。",
                "政策效果里，容量和上限类通常会永久留下；收入分配类和多数临时加成只影响本轮。",
              ]}
              examples={[
                "例：政府财政 10，本轮政府、军事、研究合计花 10，则财政扣到 0；花 11 会被拒绝。",
              ]}
              source="政府决策资源"
              tone="warning"
            />
            <FormulaCard
              title="9. 工厂增加与产业升级"
              formula={[
                "扩建：目标工业路线产能 +1，本回合生效",
                "可建数量受 总工厂上限、闲置名额、预算、科技前置 共同限制",
                "产业升级：上一阶段产能减少，下一阶段产能增加，本回合生效",
              ]}
              explanation="扩建是把闲置名额直接建成目标类型工厂；产业升级是把已有工厂逐级转换。两者都花工厂预算，并且都在生产投料前生效。"
              details={[
                "初始闲置 = 国家总工厂上限 - 已启用工厂数；扩建会消耗闲置名额，不会突破国家总上限。",
                "当前升级链是 闲置 -> 手工业 -> 机械化 -> 蒸汽工业 -> 电气工业，不支持跨级跳转。",
                "机械化需要 spinning_jenny；蒸汽需要 watt_engine + lathe；电气需要 power_generation + combustion_engine。",
                "扩建和升级都在生产投料前执行，所以本回合新增或转换后的产能可以立即参与生产。",
                "政策或改革也可能直接给产能，这类容量效果通常永久生效。",
              ]}
              examples={[
                "例：把 1 点闲置升级为手工业，本回合闲置 -1、手工业 +1，并且这 1 点手工业本回合可生产。",
              ]}
              source="工厂建设与产业升级"
            />
            <FormulaCard
              title="10. 生产投料与商品产出"
              formula={[
                "可用原材料 = 当前原材料 + 本回合购买原材料",
                "可投料 <= min(可用原材料, 单路线产能, 总投料产能, 工厂预算)",
                "商品产出 = Σ(各路线投料 × 路线产出倍率) × 临时产出倍率 × 天赋百分比",
                "投料成本 = 投料原材料数量 × 统一商品单位预算成本",
              ]}
              explanation="生产不是自动把所有原材料变成商品；玩家的投料同时受原材料、路线产能、总产能和工厂预算四个瓶颈限制。"
              details={[
                "当前统一商品单位预算成本为 1，即每投 1 原材料消耗 1 工厂预算。",
                "材料购买按数量购买，受国家每回合材料购买上限和材料购买单位成本限制，不改变永久 rawMaterialsPerTurn。",
                "手工业产出 1x，机械化 2x，蒸汽 4x，电气 8x；高级路线会显著放大同样原材料的商品产出。",
                "部分工厂政策可以临时提高产出倍率；旧固定原料按钮不再作为玩家主要入口。",
              ]}
              examples={[
                "例：蒸汽路线投 3 原材料，基础商品产出 = 3 × 4 = 12。",
              ]}
              source="工厂生产"
            />
            <FormulaCard
              title="11. 军事、航路与海外市场"
              formula={[
                "军事支出走政府财政决策额度",
                "海外容量 = baseOverseasCapacity + overseasMarketCapacityBonus",
                "海军封锁：最高舰队数 >= 阈值 且严格高于第二名",
              ]}
              explanation="军事当前主要服务海外市场：增加海外容量、控制航路封锁、争夺市场竞争奖励。"
              details={[
                "征募陆军增加 army，但受 armyCap 限制；扩充军队等政策可永久提高 armyCap。",
                "海外容量通过贸易促进等政府侧入口提高；建造舰队增加可部署舰队并用于地区封锁。",
                "建交逻辑已删除；海外区域默认可卖，出售只受库存、容量和地区封锁影响。",
                "当前殖民/征服链基本已被移除或置空，不应再按殖民收入理解军事收益。",
              ]}
              examples={[
                "例：被其他国家封锁到目标区域的 requiredNodes 后，该区域海外销售和市场竞争都会被阻断。",
              ]}
              source="军事与航路"
            />
            <FormulaCard
              title="12. 研究设施、科技与解锁"
              formula={[
                "研究进度/轮 = 研究设施总数 × 每设施进度",
                "达到阈值后首发现者掷十面骰：骰点 >= 当前突破难度则成功",
                "失败后下次突破难度 -1，进度保留",
              ]}
              explanation="研究是把政府财政转化为工业路线解锁的长期系统；科技不会直接给钱，但会打开更高级的工厂扩建和产业升级路径。"
              details={[
                "建研究院花政府财政；设置研究目标本身免费，只是指定当前研究方向。",
                "主线科技顺序是 spinning_jenny -> lathe -> watt_engine -> power_generation -> combustion_engine。",
                "如果其他国家已经首发现，后续国家达到原始阈值即可解锁，不再掷骰。",
                "科技解锁会被工厂模块检查；缺科技时高级路线不可扩建或升级。",
              ]}
              examples={[
                "例：2 个研究设施、每设施进度 1，则当前研究方向每轮 +2 进度。",
              ]}
              source="研究与科技解锁"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t("settings.productionCost.title")} eyebrow={t("settings.productionCost.eyebrow")}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <span>材料购买单位成本</span>
            <input
              type="number"
              min={0}
              value={data.production.rawMaterialPurchaseUnitCost}
              onChange={(event) => updateRawMaterialPurchaseUnitCost(Number(event.target.value))}
            />
            <small>默认 1 工厂预算 = 1 原材料；只影响本回合购买材料，不改变国家固定原料产出。</small>
          </label>
        </div>
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t("settings.productionCost.routeColumn")}</th>
              <th>扩建成本</th>
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
                    value={data.production.expansionCosts[key] ?? 0}
                    onChange={(event) =>
                      updateExpansionCost(key, Number(event.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={data.production.upgradeCosts[key] ?? 0}
                    onChange={(event) =>
                      updateUpgradeCost(key, Number(event.target.value))
                    }
                  />
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
              <th>材料购买上限</th>
              <th>工厂总上限</th>
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
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={country.materialPurchaseCapPerTurn}
                      onChange={(event) =>
                        updateCountry(key, "materialPurchaseCapPerTurn", Number(event.target.value))
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={country.factoryTotalCap}
                      onChange={(event) =>
                        updateCountry(key, "factoryTotalCap", Number(event.target.value))
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
              <th>{t("settings.market.fixedOverseasPriceColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.regions).map(([key, fixedPrice]) => (
              <tr key={key}>
                <td>{REGION_LABELS[key] ?? key}</td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={fixedPrice}
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
