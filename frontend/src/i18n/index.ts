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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, game: enGame, lobby: enLobby, room: enRoom, pages: enPages },
      zh: { common: zhCommon, game: zhGame, lobby: zhLobby, room: zhRoom, pages: zhPages },
    },
    fallbackLng: "zh",
    lng: "zh",
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

export default i18n;

/** Translate backend-provided Chinese labels/descriptions to current language */
export function translateBackend(text: unknown): string {
  if (text === null || text === undefined || text === "") return "";
  if (typeof text !== "string") {
    if (typeof text === "number" || typeof text === "boolean" || typeof text === "bigint") {
      return String(text);
    }
    if (Array.isArray(text)) {
      return text.map((item) => translateBackend(item)).filter(Boolean).join("、");
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
    return labels[bestMatch] + suffix;
  }
  return text;
}
