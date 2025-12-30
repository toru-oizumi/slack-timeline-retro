import { Hono } from 'hono';
import { TokenRepository } from '@/infrastructure/firestore';
import type { Env } from '@/shared/types';

const oauthRoutes = new Hono<{ Bindings: Env }>();

/**
 * User scopes required for reading messages
 */
const USER_SCOPES = [
  'search:read', // Search messages (includes thread replies)
  'channels:read', // List public channels (for channel name resolution)
  'groups:read', // List private channels (for channel name resolution)
  'users:read', // Get user info
  'chat:write', // Post messages (to self-DM)
  'im:write', // Open DM channels
  'im:history', // Read DM messages (for reading self-DM thread)
].join(',');

/**
 * Generate OAuth authorization URL
 */
function getOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: USER_SCOPES,
    redirect_uri: redirectUri,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Get the correct protocol (handles Cloud Run's reverse proxy)
 */
function getProtocol(c: {
  req: { header: (name: string) => string | undefined; url: string };
}): string {
  // Cloud Run uses X-Forwarded-Proto header
  const forwardedProto = c.req.header('X-Forwarded-Proto');
  if (forwardedProto) {
    return forwardedProto;
  }
  // Fallback to URL protocol (remove trailing colon)
  const url = new URL(c.req.url);
  return url.protocol.replace(':', '');
}

/**
 * OAuth install endpoint - redirects to Slack authorization
 */
oauthRoutes.get('/oauth/install', (c) => {
  const env = c.env;
  const userId = c.req.query('user_id') ?? '';

  if (!userId) {
    return c.text('Missing user_id parameter', 400);
  }

  // Use user_id as state for security
  const state = userId;

  // Construct redirect URI from request URL (use HTTPS for Cloud Run)
  const url = new URL(c.req.url);
  const protocol = getProtocol(c);
  const redirectUri = `${protocol}://${url.host}/oauth/callback`;

  const oauthUrl = getOAuthUrl(env.SLACK_CLIENT_ID, redirectUri, state);

  console.log(`OAuth install initiated for user: ${userId}`);
  return c.redirect(oauthUrl);
});

/**
 * OAuth callback endpoint - exchanges code for token and saves it
 */
oauthRoutes.get('/oauth/callback', async (c) => {
  const env = c.env;
  const code = c.req.query('code');
  const state = c.req.query('state'); // user_id
  const error = c.req.query('error');

  if (error) {
    console.error(`OAuth error: ${error}`);
    return c.html(`
      <html>
        <body>
          <h1>❌ Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }

  if (!code || !state) {
    return c.html(`
      <html>
        <body>
          <h1>❌ Invalid Request</h1>
          <p>Missing authorization code or state.</p>
        </body>
      </html>
    `);
  }

  try {
    // Construct redirect URI (must match the one used in install)
    const url = new URL(c.req.url);
    const protocol = getProtocol(c);
    const redirectUri = `${protocol}://${url.host}/oauth/callback`;

    // Exchange code for token
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenResponse.json()) as {
      ok: boolean;
      error?: string;
      authed_user?: {
        id: string;
        access_token: string;
        scope: string;
      };
      team?: {
        id: string;
        name: string;
      };
    };

    if (!tokenData.ok) {
      console.error(`OAuth token exchange failed: ${tokenData.error}`);
      return c.html(`
        <html>
          <body>
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${tokenData.error}</p>
            <p>Please try again.</p>
          </body>
        </html>
      `);
    }

    const authedUser = tokenData.authed_user;
    if (!authedUser?.access_token) {
      console.error('OAuth response missing user token');
      return c.html(`
        <html>
          <body>
            <h1>❌ Authorization Failed</h1>
            <p>No user token received. Please ensure you grant all requested permissions.</p>
          </body>
        </html>
      `);
    }

    // Verify the authed user matches the state (user_id)
    if (authedUser.id !== state) {
      console.error(`User ID mismatch: expected ${state}, got ${authedUser.id}`);
      return c.html(`
        <html>
          <body>
            <h1>❌ Authorization Failed</h1>
            <p>User ID mismatch. Please try again.</p>
          </body>
        </html>
      `);
    }

    // Save token to Firestore
    const tokenRepository = new TokenRepository();
    await tokenRepository.saveToken({
      userId: authedUser.id,
      accessToken: authedUser.access_token,
      teamId: tokenData.team?.id ?? '',
    });

    console.log(`OAuth completed for user: ${authedUser.id}, team: ${tokenData.team?.name}`);

    return c.html(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>✅ Authorization Successful!</h1>
          <p>You can now use the slash command.</p>
          <p>This token is valid for 4 hours.</p>
          <p style="color: gray; margin-top: 30px;">You can close this window.</p>
        </body>
      </html>
    `);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`OAuth callback error: ${errorMessage}`);
    return c.html(`
      <html>
        <body>
          <h1>❌ Authorization Failed</h1>
          <p>An error occurred: ${errorMessage}</p>
          <p>Please try again.</p>
        </body>
      </html>
    `);
  }
});

export { oauthRoutes };
