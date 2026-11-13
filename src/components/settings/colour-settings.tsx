"use client";

import { Check, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/hooks";
import { COLOR_PRESETS, HEX_COLOR } from "@/lib/appearance-colors";
import { cn } from "@/lib/utils";
import { SettingRow, SettingSection } from "./setting-primitives";

/** What the picker opens on when nothing has been chosen: the default blue. */
const DEFAULT_SWATCH = "#020031";

/** "#ABC", "abc", "aabbcc" or "#AABBCC" → "#aabbcc"; null when it is not a colour. */
function normalise(text: string): string | null {
  let value = text.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(value)) value = value.split("").map((c) => c + c).join("");
  const hex = `#${value}`;
  return HEX_COLOR.test(hex) ? hex : null;
}

/**
 * One bar's colour: the browser's own picker (any colour), a box for typing a
 * hex code, a row of ready-made colours, and a way back to the default. The page
 * changes as the picker is dragged, so there is nothing to save or preview.
 */
function ColourField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? "");
  const [seen, setSeen] = useState(value);
  // Follows the value when it changes from elsewhere — the picker, a swatch,
  // reset — but not when it just echoes what is being typed.
  if (value !== seen) {
    setSeen(value);
    if (normalise(draft) !== value) setDraft(value ?? "");
  }

  const isInvalid = draft.trim() !== "" && normalise(draft) === null;

  return (
    <SettingRow label={label} description={description} htmlFor={`${id}-hex`}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: pick a colour`}
          value={value ?? DEFAULT_SWATCH}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="h-9 w-12 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <Input
          id={`${id}-hex`}
          value={draft}
          placeholder="Default"
          spellCheck={false}
          maxLength={7}
          aria-invalid={isInvalid}
          onChange={(event) => {
            setDraft(event.target.value);
            // Only a complete code applies while typing: "#abc" is a valid
            // shorthand but is also the start of "#abcdef".
            if (/^#?[0-9a-fA-F]{6}$/.test(event.target.value.trim())) {
              const next = normalise(event.target.value);
              if (next) onChange(next);
            }
          }}
          onBlur={() => {
            // Shorthand ("#abc") is accepted once the person is done typing.
            const next = normalise(draft);
            if (next && next !== value) onChange(next);
            else setDraft(value ?? "");
          }}
          className="w-28 font-mono"
        />
        <Button variant="secondary" size="sm" disabled={value === null} onClick={() => onChange(null)}>
          <RotateCcw />
          Reset
        </Button>
        {value === null && <span className="text-2xs text-fg-subtle">Using the theme colour</span>}
      </div>
      {isInvalid && (
        <p role="alert" className="mt-1.5 text-2xs text-danger">
          Use a colour like #1e3a8a (three or six digits).
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`${label}: ready-made colours`}>
        {COLOR_PRESETS.map((preset) => {
          const selected = value === preset.hex;
          return (
            <button
              key={preset.hex}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={selected}
              onClick={() => onChange(preset.hex)}
              style={{ backgroundColor: preset.hex }}
              className={cn(
                "grid size-7 place-items-center rounded-md border transition-transform hover:scale-110",
                selected ? "border-accent ring-2 ring-accent/40" : "border-border-strong",
              )}
            >
              {selected && (
                <Check
                  className="size-3.5"
                  style={{ color: parseInt(preset.hex.slice(1), 16) > 0x808080 ? "#0f172a" : "#fff" }}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </SettingRow>
  );
}

export function ColourSettings() {
  const { preferences, setAppearanceColor } = usePreferences();
  const { sidebarColor, topbarColor } = preferences.appearance;

  return (
    <SettingSection
      title="Bar colours"
      description="Choose any colour for the sidebar and the top bar. Text, hover states and borders adjust on their own so it stays readable. Applies in light and dark themes, and follows you to other devices."
    >
      <ColourField
        label="Sidebar"
        description="The column on the left, and the same colour in Settings and Administration."
        value={sidebarColor}
        onChange={(next) => setAppearanceColor("sidebarColor", next)}
      />
      <ColourField
        label="Top bar"
        description="The bar across the top of every page."
        value={topbarColor}
        onChange={(next) => setAppearanceColor("topbarColor", next)}
      />
      <SettingRow
        label="Start over"
        description="Put both bars back to the theme's own colours."
        control={
          <Button
            variant="secondary"
            size="sm"
            disabled={sidebarColor === null && topbarColor === null}
            onClick={() => {
              setAppearanceColor("sidebarColor", null);
              setAppearanceColor("topbarColor", null);
            }}
          >
            <RotateCcw />
            Reset both
          </Button>
        }
      />
    </SettingSection>
  );
}
