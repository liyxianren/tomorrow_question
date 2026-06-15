import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./resources/en/common.json";
import enGame from "./resources/en/game.json";
import enLobby from "./resources/en/lobby.json";
import enRoom from "./resources/en/room.json";
import enPages from "./resources/en/pages.json";
import zhCommon from "./resources/zh/common.json";
import zhGame from "./resources/zh/game.json";
import zhLobby from "./resources/zh/lobby.json";
import zhRoom from "./resources/zh/room.json";
import zhPages from "./resources/zh/pages.json";

type InitialLanguageStorage = Pick<Storage, "getItem"> | null;

export function resolveInitialLanguage(storage?: InitialLanguageStorage): "en" | "zh" {
  try {
    const locale =
      storage === undefined ? globalThis.localStorage?.getItem("app_locale") : storage?.getItem("app_locale");
    return locale?.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

function syncDocumentMetadata(): void {
  if (typeof document === "undefined") {
    return;
  }
  const language = i18n.resolvedLanguage ?? i18n.language;
  const isChinese = language?.toLowerCase().startsWith("zh");
  document.documentElement.lang = isChinese ? "zh-CN" : "en";
  document.title = i18n.t("common:appTitle", isChinese ? "19世纪工业化列强策略游戏" : "Tomorrow Question");
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, game: enGame, lobby: enLobby, room: enRoom, pages: enPages },
      zh: { common: zhCommon, game: zhGame, lobby: zhLobby, room: zhRoom, pages: zhPages },
    },
    fallbackLng: "en",
    lng: resolveInitialLanguage(),
    returnNull: false,
    defaultNS: "common",
    ns: ["common", "game", "lobby", "room", "pages"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "app_locale",
    },
    interpolation: { escapeValue: false },
  });

i18n.on("initialized", syncDocumentMetadata);
i18n.on("languageChanged", syncDocumentMetadata);
syncDocumentMetadata();

export default i18n;

/** Translate backend-provided Chinese labels/descriptions to current language */
export function translateBackend(text: unknown): string {
  if (text === null || text === undefined || text === "") return "";
  if (typeof text !== "string") {
    if (typeof text === "number" || typeof text === "boolean" || typeof text === "bigint") {
      return String(text);
    }
    if (Array.isArray(text)) {
      const separator = i18n.language?.startsWith("zh") ? "、" : ", ";
      return text.map((item) => translateBackend(item)).filter(Boolean).join(separator);
    }
    if (typeof text === "object") {
      const record = text as Record<string, unknown>;
      const language = i18n.language?.startsWith("en") ? "en" : "zh";
      const localized = record[language] ?? record.zh ?? record.en ?? record.label ?? record.name ?? record.value;
      if (localized !== undefined && localized !== text) {
        return translateBackend(localized);
      }
      const firstPrimitive = Object.values(record).find(
        (value) => value !== null && ["string", "number", "boolean", "bigint"].includes(typeof value),
      );
      return firstPrimitive !== undefined ? translateBackend(firstPrimitive) : "";
    }
    return String(text);
  }
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  if (!hasChinese) return text;
  const dynamicTranslation = translateDynamicBackendText(text);
  if (dynamicTranslation) return dynamicTranslation;
  // Direct resource bundle lookup (bypasses key separator issues)
  const ns = i18n.getResourceBundle(i18n.language, "game") as Record<string, unknown> | undefined;
  const labels = ns?.backendLabels as Record<string, string> | undefined;
  if (!labels) return text;
  // Try exact match first
  if (labels[text]) return labels[text];
  // Try prefix match: find longest matching key
  let bestMatch = "";
  for (const key of Object.keys(labels)) {
    if (text.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  if (bestMatch) {
    const suffix = text.slice(bestMatch.length);
    return labels[bestMatch] + translateBackend(suffix);
  }
  // Try suffix match for backend templates that prefix a translated label.
  bestMatch = "";
  for (const key of Object.keys(labels)) {
    if (text.endsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  if (bestMatch) {
    const prefix = text.slice(0, -bestMatch.length);
    return translateBackend(prefix) + labels[bestMatch];
  }
  return text;
}

function translateDynamicBackendText(text: string): string | null {
  const rawMaterialsFirst = text.match(
    /^当前有 (\d+) 原材料，优先安排投料；每投 1 原材料会占用 1 工厂预算，剩余预算再考虑升级或扩建。$/,
  );
  if (rawMaterialsFirst) {
    return i18n.t("game:backendDynamic.aiRawMaterialsFirstBody", { rawMaterials: rawMaterialsFirst[1] });
  }

  const overseasSell = text.match(/^海外容量约 (\d+)，优先投向欧洲、美洲等高价地区，剩余库存再回国内。$/);
  if (overseasSell) {
    return i18n.t("game:backendDynamic.aiOverseasSellBody", { capacity: overseasSell[1] });
  }

  const colonize = text.match(/^消耗 (\d+) 陆军，之后每回合原材料 \+(\d+)。$/);
  if (colonize) {
    return i18n.t("game:backendDynamic.aiColonizeBody", {
      armyCost: colonize[1],
      rawMaterials: colonize[2],
    });
  }

  const colonizationShortage = text.match(/^殖民需要 (\d+) 陆军；若想走殖民原材料路线，先征募陆军。$/);
  if (colonizationShortage) {
    return i18n.t("game:backendDynamic.aiColonizationShortageBody", { armyCost: colonizationShortage[1] });
  }

  const suppressIdeologyLabel = text.match(/^镇压(.+)$/);
  if (suppressIdeologyLabel) {
    return i18n.t("game:backendDynamic.suppressIdeologyLabel", {
      ideology: translateBackend(suppressIdeologyLabel[1]),
    });
  }

  const suppressIdeologyBody = text.match(/^消耗 (\d+) 陆军压制(.+)思潮压力。$/);
  if (suppressIdeologyBody) {
    return i18n.t("game:backendDynamic.suppressIdeologyBody", {
      armyCost: suppressIdeologyBody[1],
      ideology: translateBackend(suppressIdeologyBody[2]),
    });
  }

  const finalReformLock = text.match(/^最终改革：实施后锁定(.+)。$/);
  if (finalReformLock) {
    const pathSeparator = i18n.language?.startsWith("zh") ? "、" : ", ";
    const paths = finalReformLock[1].split("、").map((path) => translateBackend(path)).join(pathSeparator);
    return i18n.t("game:backendDynamic.finalReformLockBody", { paths });
  }

  return null;
}
