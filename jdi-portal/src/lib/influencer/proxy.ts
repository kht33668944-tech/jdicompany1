export function proxyImageUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("http")) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.endsWith("supabase.co") || u.hostname === "localhost") {
      return rawUrl;
    }
  } catch {
    return rawUrl;
  }
  return `/api/influencer-thumbnail?url=${encodeURIComponent(rawUrl)}`;
}
