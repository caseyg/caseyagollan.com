/** `$app/navigation` for the table view, which has no router: going somewhere means the host opens it. */
export const goto = async (url: string | URL) => void window.open(String(url));
export const invalidate = async () => {};
export const invalidateAll = async () => {};
export const preloadData = async () => ({ type: 'loaded' as const, status: 200, data: {} });
export const preloadCode = async () => {};
export const pushState = () => {};
export const replaceState = () => {};
export const beforeNavigate = () => {};
export const afterNavigate = () => {};
export const onNavigate = () => {};
