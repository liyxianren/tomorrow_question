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
