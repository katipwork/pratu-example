/**
 * Runs a promise and reports failure as a value instead of an exception.
 *
 * Server components use this to create a flow: returning JSX from inside a
 * `try` block is unsafe in React (render errors escape the handler), so the
 * try/catch has to end before any JSX exists.
 */
export type Attempt<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export async function attempt<T>(promise: Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
