import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();

  // Radix locks the page while a modal menu is open by setting
  // `pointer-events: none` on <body>. Unmounting mid-open leaves it behind, and
  // userEvent then refuses to click anything in the next test.
  document.body.style.pointerEvents = "";
  document.body.removeAttribute("data-scroll-locked");
  for (const node of document.querySelectorAll("[data-radix-popper-content-wrapper]")) {
    node.remove();
  }
});

// jsdom lacks the observers the message list and charts rely on.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("ResizeObserver", NoopObserver);
vi.stubGlobal("IntersectionObserver", NoopObserver);

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

/**
 * Radix menus and popovers use the Pointer Events capture API, which jsdom does
 * not implement. Without these, a dropdown never opens under test even though
 * it works perfectly in a browser.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (typeof window !== "undefined" && !window.PointerEvent) {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  vi.stubGlobal("PointerEvent", JsdomPointerEvent);
}
