import { useTranslation } from "react-i18next";


type AppLanguage = "en" | "zh";

type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
};

const LANGUAGE_OPTIONS: Array<{ code: AppLanguage; labelKey: string }> = [
  { code: "en", labelKey: "language.options.en" },
  { code: "zh", labelKey: "language.options.zh" },
];

function normalizeAppLanguage(language: string | undefined): AppLanguage {
  return language?.toLowerCase().startsWith("en") ? "en" : "zh";
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation("common");
  const currentLanguage = normalizeAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const classNames = [
    "language-switcher",
    compact ? "language-switcher--compact" : null,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div
      aria-label={t("language.ariaLabel")}
      className={classNames}
      data-testid="language-switcher"
      role="group"
    >
      {LANGUAGE_OPTIONS.map((option) => {
        const isCurrent = currentLanguage === option.code;

        return (
          <button
            aria-pressed={isCurrent}
            className="language-switcher__button"
            data-testid={`language-switch-${option.code}`}
            key={option.code}
            onClick={() => {
              if (!isCurrent) {
                void i18n.changeLanguage(option.code);
              }
            }}
            type="button"
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
