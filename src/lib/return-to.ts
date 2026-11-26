/** Only return to local pages, including their query and fragment. */
export function safeReturnTo(value: string | null, origin: string): string | null {
 if (!value?.startsWith('/') || value.startsWith('//')) return null;
 try {
  const target = new URL(value, origin);
  return target.origin === origin ? target.pathname + target.search + target.hash : null;
 } catch { return null; }
}
