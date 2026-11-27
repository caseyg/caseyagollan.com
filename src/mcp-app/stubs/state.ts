/** `$app/state` for the table view: one page that never changes. */
export const page = { url: new URL(location.href), params: {}, route: { id: null }, status: 200, error: null, data: {} as Record<string, unknown>, state: {} as Record<string, unknown>, form: null };
export const navigating = { from: null, to: null, type: null, willUnload: null, delta: null, complete: null };
export const updated = { current: false, check: async () => false };
