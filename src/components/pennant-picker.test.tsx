// @vitest-environment jsdom
/**
 * The picker's own-flag flow (#428): the "Make your own" tile, the maker it
 * opens, and the `avatarId` input that Done fills. The seam is the rendered
 * picker; what posts is the input's value, which the page's Save sends.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PennantPicker } from "./pennant-picker";

afterEach(cleanup);

const posted = () => (screen.getByLabelText("Your pennant") as HTMLInputElement).value;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tap = (name: string | RegExp) => fireEvent.click(button(name));

/** A maker setting by its heading, e.g. "Flag color", so Plum the flag isn't Plum the pattern color. */
const setting = (title: string) => within(screen.getByRole("region", { name: new RegExp(`^${title} ·`) }));
const pick = (title: string, name: string) => fireEvent.click(setting(title).getByRole("button", { name }));
const picked = (title: string, name: string) =>
  setting(title).getByRole("button", { name }).getAttribute("aria-pressed");

const openFlags = () => tap(/Flags/);

describe("Make your own", () => {
  test("says there is one on the Flags card, on the welcome page only", () => {
    render(<PennantPicker welcome />);
    expect(screen.getByText("15 presets, or make your own")).toBeTruthy();
    cleanup();
    render(<PennantPicker />);
    expect(screen.getByText("15 pennants")).toBeTruthy();
    openFlags();
    expect(screen.queryByRole("button", { name: "Make your own" })).toBeNull();
  });

  test("a preset tap chooses it without opening the maker", () => {
    render(<PennantPicker welcome />);
    openFlags();
    tap(/Sky Star/);
    expect(posted()).toBe("pennants-22");
    expect(button(/Sky Star/).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Done")).toBeNull();
  });

  test("Done chooses the design made, and the tile then edits it", () => {
    render(<PennantPicker welcome />);
    openFlags();
    tap("Make your own");
    expect(screen.getByText("New")).toBeTruthy();
    pick("Flag color", "Plum");
    pick("Pattern", "Star");
    pick("Pole", "Gold");
    expect(screen.getByText("Flag color · Plum")).toBeTruthy();
    tap("Done");

    expect(posted()).toBe("own-plum-star-cream-gold-auto");
    expect(button("Edit your own flag").getAttribute("aria-pressed")).toBe("true");

    tap("Edit your own flag");
    expect(screen.getByText("Editing yours")).toBeTruthy();
    expect(picked("Flag color", "Plum")).toBe("true");
    expect(picked("Pattern", "Star")).toBe("true");
    expect(picked("Pole", "Gold")).toBe("true");
  });

  test("Back leaves the maker without choosing anything", () => {
    render(<PennantPicker welcome selected="pennants-04" />);
    openFlags();
    tap("Make your own");
    pick("Flag color", "Moss");
    tap("Back to Flags");
    expect(posted()).toBe("pennants-04");
    expect(button("Make your own")).toBeTruthy();
  });

  test("opens on the saved design while it is the member's pennant, and says so", () => {
    render(<PennantPicker welcome selected="own-sage-twinbands-pine-stone-auto" />);
    expect(screen.getByText("Your own flag")).toBeTruthy();
    openFlags();
    tap("Edit your own flag");
    expect(picked("Flag color", "Sage")).toBe("true");
    expect(picked("Pattern", "Twin Bands")).toBe("true");
    expect(picked("Pattern color", "Pine")).toBe("true");
  });

  test("opens blank once the member has saved something else", () => {
    render(<PennantPicker welcome selected="pennants-17" />);
    openFlags();
    tap("Make your own");
    expect(screen.getByText("Flag color · Pine")).toBeTruthy();
    expect(screen.getByText("Pattern · Plain")).toBeTruthy();
  });

  test("warns when the pattern color matches the flag", () => {
    render(<PennantPicker welcome />);
    openFlags();
    tap("Make your own");
    pick("Pattern", "Dot");
    expect(screen.queryByText(/pattern won’t show/)).toBeNull();
    pick("Pattern color", "Pine");
    expect(screen.getByText("Same as the flag, so the pattern won’t show.")).toBeTruthy();
  });
});
