import { useCallback } from "react";
import { useApp } from "./use-app";
import { translate, type TranslationParams } from "@/lib/i18n";

export function useTranslation() {
  const { settings } = useApp();
  const locale = settings.language;
  const t = useCallback((message: string | undefined, params?: TranslationParams) => translate(locale, message ?? "", params), [locale]);
  return { t, locale };
}
