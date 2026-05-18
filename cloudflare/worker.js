const APP_URL = 'https://hotizonte-mariagoretti.github.io/billing-app/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== '/callback') {
      return new Response('Not found', { status: 404 });
    }

    const code = url.searchParams.get('code');
    if (!code) {
      return Response.redirect(`${APP_URL}#auth_error=missing_code`);
    }

    let data;
    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      data = await res.json();
    } catch {
      return Response.redirect(`${APP_URL}#auth_error=worker_fetch_failed`);
    }

    if (data.error || !data.access_token) {
      return Response.redirect(`${APP_URL}#auth_error=${encodeURIComponent(data.error || 'no_token')}`);
    }

    return Response.redirect(`${APP_URL}#token=${data.access_token}`);
  },
};
