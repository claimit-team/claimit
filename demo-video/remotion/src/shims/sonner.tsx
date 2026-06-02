// Stub for `sonner` toast notifications — no-op in a still render.
type Toast = ((_: unknown, __?: unknown) => void) & {
  success: (m: unknown) => void;
  error: (m: unknown) => void;
  info: (m: unknown) => void;
  message: (m: unknown) => void;
  warning: (m: unknown) => void;
  dismiss: () => void;
  loading: (m: unknown) => void;
};

const noop = () => {};
export const toast: Toast = Object.assign(noop, {
  success: noop,
  error: noop,
  info: noop,
  message: noop,
  warning: noop,
  dismiss: noop,
  loading: noop,
}) as Toast;

export function Toaster() {
  return null;
}
