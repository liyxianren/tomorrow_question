import i18n, { translateBackend } from "../../i18n";

function humanizeKey(value: unknown): string {
  return String(value ?? "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveLabel(ns: string, value: string): string {
  if (typeof value !== "string") {
    return humanizeKey(value);
  }
  const backendLabel = translateBackend(value);
  if (backendLabel && backendLabel !== value) {
    return backendLabel;
  }
  return i18n.t(`game:${ns}.${value}`, { defaultValue: humanizeKey(value) });
}

const reformReverseLookup: Record<string, string> = {
  "文官制度": "civil service",
  "工厂法": "factory act",
  "土地改革": "land reform",
  "公立学校": "public schools",
};

const policyReverseLookup: Record<string, string> = {
  "自由贸易": "free trade",
  "海军法": "naval act",
  "新闻管制": "press controls",
  "保护性关税": "protective tariffs",
};

export function getCountryLabel(value: string | null | undefined): string {
  if (!value) return i18n.t("common:none", "None");
  return resolveLabel("country", value);
}

export function getProductionRouteLabel(value: string): string {
  return resolveLabel("productionRoute", value);
}

export function getGoodsLabel(value: string): string {
  return resolveLabel("goods", value);
}

export function getAccessLevelLabel(value: string): string {
  return resolveLabel("accessLevel", value);
}

export function getIdeologyLabel(value: string): string {
  return resolveLabel("ideology", value);
}

export function getReformLabel(value: string): string {
  return resolveLabel("reform", value);
}

export function getPolicyLabel(value: string): string {
  return resolveLabel("policy", value);
}

export function getTechnologyLabel(value: string): string {
  return resolveLabel("technology", value);
}

export function getResearchFacilityLabel(value: string): string {
  return resolveLabel("researchFacility", value);
}

export function getRegionLabel(value: string): string {
  return resolveLabel("region", value);
}

export function getOceanNodeLabel(value: string): string {
  return resolveLabel("oceanNode", value);
}

export function getRouteLabel(value: string): string {
  return resolveLabel("route", value);
}

export function getUnitLabel(value: string): string {
  return resolveLabel("unit", value);
}

export function formatTranslatedAgenda(
  items: string[],
  getLabel: (value: string) => string,
): string {
  return items.map((item) => getLabel(item)).join("\n");
}

export function resolveReformKey(value: string): string {
  return reformReverseLookup[value] ?? value.trim();
}

export function resolvePolicyKey(value: string): string {
  return policyReverseLookup[value] ?? value.trim();
}
