// French ships with the app (use-t.js imports it directly). English is its own chunk, fetched the
// first time someone picks English. Until it arrives — or if the fetch fails offline — the text
// stays French rather than blank.
let english = null;
let pending = null;

export function getEnglish() {
  return english;
}

export function loadEnglish() {
  if (english) return Promise.resolve(english);
  if (!pending) {
    pending = import("./i18n-en")
      .then((module) => { english = module.default; return english; })
      .catch((error) => { pending = null; throw error; });
  }
  return pending;
}
