import http from 'node:http';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

// Disposable local protocol fixture. Never imported by application/build inputs.
export async function startProvider(frontendOrigin = 'http://127.0.0.1:4175') {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(frontendOrigin))
    throw new Error('The disposable identity provider requires a loopback frontend.');
  const issuer = 'http://127.0.0.1:18999';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'local-test',
    use: 'sig',
    alg: 'RS256',
  };
  const codes = new Map();
  const accessTokens = new Map();
  const stats = { authorizations: 0, exchanges: 0, pkce: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, issuer);
    const send = (value, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/.well-known/openid-configuration')
      return send({
        issuer,
        authorization_endpoint: issuer + '/oauth2/authorize',
        token_endpoint: issuer + '/oauth2/token',
        jwks_uri: issuer + '/oauth2/jwks',
        userinfo_endpoint: issuer + '/userinfo',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
      });
    if (url.pathname === '/oauth2/jwks') return send({ keys: [jwk] });
    if (url.pathname === '/oauth2/authorize') {
      const params = url.searchParams;
      const callback = params.get('redirect_uri');
      if (
        ![
          frontendOrigin + '/api/v1/auth/callback/google',
          'http://127.0.0.1:4175/api/v1/auth/callback/google',
          'http://127.0.0.1:4177/api/v1/auth/callback/google',
        ].includes(callback) ||
        params.get('client_id') !== 'test-google-client' ||
        !params.get('state') ||
        !params.get('nonce') ||
        params.get('code_challenge_method') !== 'S256' ||
        !params.get('code_challenge')
      )
        return send({ error: 'invalid_request' }, 400);
      if (!params.has('account')) {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        const link = (account) => {
          const target = new URL(url);
          target.searchParams.set('account', account);
          return target.pathname + target.search;
        };
        return res.end(
          '<!doctype html><title>Local test identity provider</title><h1>Local test identity provider</h1>' +
            ['alice', 'bob', 'cancel']
              .map(
                (account) =>
                  `<p><a href="${link(account).replaceAll('&', '&amp;')}">${account}</a></p>`,
              )
              .join(''),
        );
      }
      const account = params.get('account');
      const target = new URL(callback);
      target.searchParams.set('state', params.get('state'));
      if (account === 'cancel') target.searchParams.set('error', 'access_denied');
      else if (['alice', 'bob'].includes(account)) {
        const code = randomBytes(24).toString('base64url');
        codes.set(code, {
          account,
          callback,
          nonce: params.get('nonce'),
          challenge: params.get('code_challenge'),
          issued: Date.now(),
        });
        target.searchParams.set('code', code);
        stats.authorizations++;
      } else return send({ error: 'invalid_request' }, 400);
      res.writeHead(302, { Location: target.href, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (url.pathname === '/oauth2/token' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) return send({ error: 'invalid_request' }, 400);
      }
      const params = new URLSearchParams(body);
      const entry = codes.get(params.get('code'));
      codes.delete(params.get('code'));
      if (
        !entry ||
        Date.now() - entry.issued > 60000 ||
        req.headers.authorization !==
          'Basic ' + Buffer.from('test-google-client:test-google-secret').toString('base64') ||
        params.get('grant_type') !== 'authorization_code' ||
        params.get('redirect_uri') !== entry.callback ||
        createHash('sha256')
          .update(params.get('code_verifier') ?? '')
          .digest('base64url') !== entry.challenge
      )
        return send({ error: 'invalid_grant' }, 400);
      stats.exchanges++;
      stats.pkce++;
      const now = Math.floor(Date.now() / 1000);
      const claims = {
        iss: issuer,
        sub: entry.account,
        aud: 'test-google-client',
        iat: now,
        exp: now + 300,
        nonce: entry.nonce,
        name: entry.account === 'alice' ? 'Alice Example' : 'Bob Example',
      };
      const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const input = encoded({ alg: 'RS256', kid: jwk.kid }) + '.' + encoded(claims);
      const idToken =
        input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
      const accessToken = randomBytes(24).toString('base64url');
      accessTokens.set(accessToken, claims);
      return send({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
        scope: 'openid profile email',
      });
    }
    if (url.pathname === '/userinfo') {
      const claims = accessTokens.get(req.headers.authorization?.replace(/^Bearer /, ''));
      return claims
        ? send({ sub: claims.sub, name: claims.name })
        : send({ error: 'invalid_token' }, 401);
    }
    send({ error: 'not_found' }, 404);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(18999, '127.0.0.1', resolve);
  });
  return {
    stats,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}

if (process.argv[1]?.endsWith('oidc-provider.mjs')) {
  await startProvider();
  console.log('Disposable local OIDC fixture ready on 127.0.0.1:18999');
}
