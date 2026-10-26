// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_MANAGER_UI_VERSION, MANAGER_UI_KEY, MANAGER_UI_KEY_BEFORE_V3, readManagerUiVersion } from "./manager-ui-version";

afterEach(() => window.localStorage.clear());

// V3 is the default since V2.4.183; a choice made before (often V2) is ignored once.
describe("Gestion version", () => {
  it("opens V3 by default, even where V2 had been chosen before V3 became the default", () => {
    expect(DEFAULT_MANAGER_UI_VERSION).toBe("v3");
    expect(readManagerUiVersion()).toBe("v3");
    window.localStorage.setItem(MANAGER_UI_KEY_BEFORE_V3, "v2");
    expect(readManagerUiVersion()).toBe("v3");
  });

  it("keeps the choice made since", () => {
    window.localStorage.setItem(MANAGER_UI_KEY, "v2");
    expect(readManagerUiVersion()).toBe("v2");
    window.localStorage.setItem(MANAGER_UI_KEY, "nonsense");
    expect(readManagerUiVersion()).toBe("v3");
  });
});
