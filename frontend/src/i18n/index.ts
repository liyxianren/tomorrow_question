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
    fallbackLng: "en",
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
