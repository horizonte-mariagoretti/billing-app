// GitHub OAuth Device Flow client.
//
// Flow:
//   1. POST /login/device/code  → device_code, user_code, verification_uri, interval, expires_in
//   2. Show user_code + link to verification_uri.
//   3. Poll POST /login/oauth/access_token until access_token returned or expired.
//   4. Save token to localStorage; treat exactly like a PAT for the rest of the app.
//
// GitHub Device Flow endpoints allow CORS as of 2022, so this works from a
// pure browser SPA. The Client ID is public — safe to bundle / commit.

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL       = 'https://github.com/login/oauth/access_token';

// Default scope set: we need full repo write because the GitHub App grants
// the actual fine-grained permissions via its installation. The scope here
// only affects which app permissions are exposed to the user-to-server token.
const DEFAULT_SCOPE = 'repo';

async function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function startDeviceFlow(clientId, scope = DEFAULT_SCOPE) {
  if (!clientId) throw new Error('GitHub App Client ID is required');
  const data = await postForm(DEVICE_CODE_URL, {
    client_id: clientId,
    scope,
  });
  // Shape: { device_code, user_code, verification_uri, expires_in, interval }
  return data;
}

// Polls every `interval` seconds until success or terminal error. Resolves
// to { access_token, token_type, scope } or throws Error with code in
// .code  ('access_denied' | 'expired_token' | 'unsupported_grant_type' | ...).
export async function pollForToken(clientId, deviceCode, interval, expiresIn, signal) {
  const deadline = Date.now() + (expiresIn || 900) * 1000;
  let waitMs = Math.max(1000, (interval || 5) * 1000);

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      const e = new Error('aborted');
      e.code = 'aborted';
      throw e;
    }

    await new Promise((resolve) => {
      const t = setTimeout(resolve, waitMs);
      if (signal) {
        signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
      }
    });

    let data;
    try {
      data = await postForm(TOKEN_URL, {
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
    } catch (err) {
      // postForm throws on non-2xx but Device Flow uses 200 + error field.
      // If something else broke (network/CORS), rethrow.
      throw err;
    }

    if (data.access_token) {
      return data;
    }

    switch (data.error) {
      case 'authorization_pending':
        // User hasn't completed the flow yet — keep polling.
        break;
      case 'slow_down':
        // GitHub asks us to back off; bump interval and continue.
        waitMs += 5000;
        break;
      case 'expired_token': {
        const e = new Error('Device code expired. Restart sign-in.');
        e.code = 'expired_token';
        throw e;
      }
      case 'access_denied': {
        const e = new Error('Access denied. Sign-in was cancelled.');
        e.code = 'access_denied';
        throw e;
      }
      case 'unsupported_grant_type':
      case 'incorrect_client_credentials':
      case 'incorrect_device_code':
      default: {
        const e = new Error(data.error_description || data.error || 'Unknown error');
        e.code = data.error || 'unknown';
        throw e;
      }
    }
  }

  const e = new Error('Device code expired before sign-in completed.');
  e.code = 'expired_token';
  throw e;
}
