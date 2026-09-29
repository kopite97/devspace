const supported =
  /^(?:\/|\/projects(?:\/[^/]+)?|\/tasks|\/journals(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/edit)?|\/library)$/;

export function safeReturnTo(candidate: string): string {
  if (!candidate.startsWith('/') || candidate.startsWith('//') || /[\\#\s]/.test(candidate))
    return '/';
  let decoded = candidate;
  try {
    // Reject nested encoding as well as the backend's single-decoding hazards.
    for (let i = 0; i < 3; i++) {
      decoded = decodeURIComponent(decoded);
      if (
        decoded.startsWith('//') ||
        /[\\\r\n]|:\/\//.test(decoded) ||
        /^\/(?:api|oauth2)(?:\/|$)/.test(decoded)
      )
        return '/';
    }
    const url = new URL(candidate, 'https://local.invalid');
    if (
      !supported.test(url.pathname) ||
      url.pathname !== candidate.split('?')[0] ||
      /%(?:2e|2f|5c|25)/i.test(url.pathname)
    )
      return '/';
    const query = new URLSearchParams();
    for (const key of [
      'scope',
      'category',
      'projectId',
      'q',
      'archived',
      'projectStatus',
      'from',
      'to',
      'sort',
    ]) {
      for (const value of url.searchParams.getAll(key)) query.append(key, value);
    }
    return url.pathname + (query.size ? '?' + query : '');
  } catch {
    return '/';
  }
}

export function consumeLoginError(url: URL): { url: URL; failed: boolean } {
  const cleaned = new URL(url);
  const failed = cleaned.searchParams.get('authError') === 'login_failed';
  if (failed) cleaned.searchParams.delete('authError');
  return { url: cleaned, failed };
}

export function loginUrl(candidate: string): string {
  return '/api/v1/auth/login?returnTo=' + encodeURIComponent(safeReturnTo(candidate));
}
