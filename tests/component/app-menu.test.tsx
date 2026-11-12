import { describe, expect, it } from "vitest";
import { appMenuEntries } from "@/components/layout/app-menu";

/**
 * The app menu lists the places in the app. Who sees the administrator's tools is
 * the part to get right: a member must not be offered a door they cannot open.
 */
const entries = (pathname: string, canAdminister = false, canChangeSettings = false) => {
  const { places, tools } = appMenuEntries({ pathname, canAdminister, canChangeSettings });
  return { all: [...places, ...tools].map((entry) => entry.label), here: [...places, ...tools].filter((e) => e.current).map((e) => e.label) };
};

describe("the app menu", () => {
  it("offers a member only the chat", () => {
    expect(entries("/workspace").all).toEqual(["Channels"]);
  });

  it("offers Administration to an administrator", () => {
    expect(entries("/workspace", true).all).toEqual(["Channels", "Administration"]);
  });

  it("offers Integrations to whoever can change settings, with or without Administration", () => {
    expect(entries("/workspace", false, true).all).toEqual(["Channels", "Integrations"]);
    expect(entries("/workspace", true, true).all).toEqual(["Channels", "Administration", "Integrations"]);
  });

  it("ticks exactly the place you are in", () => {
    expect(entries("/workspace", true, true).here).toEqual(["Channels"]);
    // Integrations is part of Administration, but it is the more specific place.
    expect(entries("/admin/integrations", true, true).here).toEqual(["Integrations"]);
    expect(entries("/admin/teams", true, true).here).toEqual(["Administration"]);
    expect(entries("/admin", true, true).here).toEqual(["Administration"]);
    expect(entries("/settings/profile", true, true).here).toEqual([]);
  });

  it("sends each entry where it says", () => {
    const { places, tools } = appMenuEntries({ pathname: "/", canAdminister: true, canChangeSettings: true });
    expect([...places, ...tools].map((entry) => entry.href)).toEqual(["/workspace", "/admin", "/admin/integrations"]);
  });
});
