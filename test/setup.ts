import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom does not implement PointerEvent. React and testing-library dispatch
// pointer events by name, so aliasing to MouseEvent keeps clientX/clientY.
if (typeof window.PointerEvent === 'undefined') {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = window.MouseEvent;
}

// Newer Node runtimes expose their own experimental globalThis.localStorage,
// which is not the jsdom Storage instance. Bind the global to the real jsdom
// window.localStorage (not a mock) so persistence code and tests share one
// store. In environments where jsdom already supplies the correct storage this
// is a harmless re-bind.
Object.defineProperty(globalThis, 'localStorage', {
  value: (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage,
  configurable: true,
  writable: true,
});

afterEach(() => {
  cleanup();
});
