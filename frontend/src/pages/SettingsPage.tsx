import { useEffect, useState } from "react";

import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { apiRequest } from "../services/http";


type IdeologyShiftRule = { highThreshold: number; lowThreshold: number };

type NumericPathSegment = string | number;

type NumericConfigEntry = {
  path: NumericPathSegment[];
  pathLabel: string;
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
};

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const PRODUCTION_LEVELS: Array<{ key: string; label: string }> = [
  { key: "handicraft", label: "手工业 (handicraft)" },
  { key: "mechanized", label: "机械化 (mechanized)" },
  { key: "steam", label: "蒸汽 (steam)" },
  { key: "electrified", label: "电气化 (electrified)" },
];

const UPGRADABLE_LEVELS = new Set(["mechanized", "steam", "electrified"]);

const COUNTRY_LABELS: Array<{ key: string; label: string }> = [
  { key: "britain", label: "英国" },
  { key: "france", label: "法国" },
  { key: "prussia", label: "普鲁士" },
  { key: "austria", label: "奥地利" },
  { key: "russia", label: "俄国" },
];

const REGION_LABELS: Record<string, string> = {
  europe: "欧洲",
  americas: "美洲",
  africa: "非洲",
  middle_east: "中东",
  asia_pacific: "亚太",
};

const IDEOLOGY_LABELS: Array<{ key: string; label: string }> = [
  { key: "liberalism", label: "自由主义" },
  { key: "egalitarianism", label: "平等主义" },
  { key: "nationalism", label: "民族主义" },
];

const CONFIG_FILE_LABELS: Record<string, string> = {
  "abilities.json": "国家能力",
  "countries.json": "国家初始值",
  "decision_actions.json": "行动 / 政策",
  "events.json": "事件",
  "global.json": "全局",
  "market.json": "市场",
  "military.json": "军事",
  "military_actions.json": "军事行动",
  "politics.json": "政治 / 思潮",
  "production.json": "生产",
  "reforms.json": "改革",
  "regions.json": "区域",
  "research_actions.json": "天赋树",
  "technology.json": "科技树",
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

function isCoveredNumericEntry(fileName: string, entry: NumericConfigEntry): boolean {
  return COVERED_NUMERIC_PATHS.has(numericPathKey(fileName, entry.path));
}


export function SettingsPage() {
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
          setLoadError(error instanceof Error ? error.message : "加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <PageShell className="settings-page">
        <SectionCard title="配置面板" tone="muted">
          <p>加载配置失败：{loadError}</p>
        </SectionCard>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell className="settings-page">
        <SectionCard title="配置面板" tone="muted">
          <p>正在加载...</p>
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

  const buildSavePayload = (): SettingsPayload => ({
    ...data,
    numericConfig: Object.fromEntries(
      Object.entries(data.numericConfig).map(([fileName, entries]) => [
        fileName,
        entries.filter((entry) => !isCoveredNumericEntry(fileName, entry)),
      ]),
    ),
  });

  const handleSave = async () => {
    setStatus({ kind: "saving" });
    try {
      await apiRequest("/api/v1/settings", { method: "POST", body: buildSavePayload() });
      setStatus({ kind: "success", message: "保存成功" });
    } catch (error: unknown) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "保存失败",
      });
    }
  };

  return (
    <PageShell className="settings-page" width="wide">
      <SectionCard
        eyebrow="参数面板"
        title="数值配置"
        description="上方是常用平衡项；底部“全部 JSON 数值”会自动列出配置文件里的其余数字。保存后写回 backend/config/balance/*.json 并清空配置缓存。"
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <PrimaryButton
            disabled={status.kind === "saving"}
            onClick={handleSave}
            type="button"
          >
            {status.kind === "saving" ? "保存中..." : "保存"}
          </PrimaryButton>
          {status.kind === "success" ? (
            <span style={{ color: "#2f8a4d" }}>{status.message}</span>
          ) : null}
          {status.kind === "error" ? (
            <span style={{ color: "#b8323a" }}>{status.message}</span>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="生产成本" eyebrow="production">
        <table className="settings-table">
          <thead>
            <tr>
              <th>生产方式</th>
              <th>新建成本</th>
              <th>升级成本</th>
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

      <SectionCard title="各国原材料" eyebrow="countries">
        <table className="settings-table">
          <thead>
            <tr>
              <th>国家</th>
              <th>初始原材料</th>
              <th>每回合增量</th>
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

      <SectionCard title="市场参数" eyebrow="market">
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span>baseIncomePerRound（每回合保底收入）</span>
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
              <th>区域</th>
              <th>价格倍率</th>
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

      <SectionCard title="政府参数" eyebrow="government">
        <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <span>行政能力价格（administrationCost）</span>
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
            <span>思潮范围 - 最小值</span>
            <input
              type="number"
              value={data.government.ideologyMin}
              onChange={(event) =>
                updateGovernmentField("ideologyMin", Number(event.target.value))
              }
            />
            <span>最大值</span>
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
              <th>思潮</th>
              <th>高阈值</th>
              <th>低阈值</th>
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
        title="全部 JSON 数值"
        eyebrow="balance/*.json"
        description="这里列出未在上方常用面板中单独展示的全部数值。路径即对应 JSON 文件中的位置；修改后点击顶部保存即可生效。"
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
                    <th>配置路径</th>
                    <th>数值</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map((entry) => (
                    <tr key={`${fileName}:${entry.pathLabel}`}>
                      <td>
                        <code>{entry.pathLabel}</code>
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
