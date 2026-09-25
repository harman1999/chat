"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PreferencesEffects } from "./preferences-effects";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

/** Toasts inherit the resolved theme and the app's own surface tokens. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      offset={16}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface-raised !border !border-border !text-fg !shadow-lg !rounded-lg !text-sm !font-sans",
          description: "!text-fg-muted !text-xs",
          actionButton: "!bg-accent !text-accent-fg !rounded-md !text-xs !h-7",
          cancelButton: "!bg-surface-hover !text-fg-muted !rounded-md !text-xs !h-7",
          error: "!text-danger",
          success: "!text-success",
        },
      }}
    />
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <TooltipProvider delayDuration={350} skipDelayDuration={250}>
          <PreferencesEffects />
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
