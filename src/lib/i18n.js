// Both dictionaries together, for tests and tools. The app itself does NOT import this file:
// use-t.js loads French eagerly and English on demand (i18n-fr.js / i18n-en.js), so the
// English text (~half of the dictionary bytes) stays out of the main bundle.
import en from "./i18n-en";
import fr from "./i18n-fr";

export { SUPPORTED_LANGUAGES } from "./languages";

export const dictionaries = { en, fr };
