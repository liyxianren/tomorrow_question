import { useEffect, useState } from "react";

import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { apiRequest } from "../services/http";


type SettingsPayload = {
  production: {
    newFactoryCosts: Record<string, number>;
    upgradeCosts: Record<string, number>;
  };
  countries: Record<string, { initialRawMaterials: number; rawMaterialsPerTurn: number }>;
  global: { baseIncomePerRound: number };
  regions: Record<string, number>;
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

  const handleSave = async () => {
    setStatus({ kind: "saving" });
    try {
      await apiRequest("/api/v1/settings", { method: "POST", body: data });
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
        title="生产 & 市场配置"
        description="编辑后保存会写回 backend/config/balance/*.json 并清空配置缓存。"
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
    </PageShell>
  );
}
