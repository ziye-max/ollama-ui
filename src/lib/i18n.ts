import english from "./en.json";
import type { Language } from "./types";

export type TranslationParams = Record<string, string | number>;

export function translate(language: Language, message: string, params?: TranslationParams): string {
  const dictionary: Record<string, string> = english;
  const text = language === "en-US" && Object.hasOwn(dictionary, message) ? dictionary[message] : message;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => params?.[key] === undefined ? match : String(params[key]));
}
