<?php

declare(strict_types=1);

namespace MediaStart\Auth\Broker;

use Jasny\Immutable;

/**
 * auth_global — SSO Broker.
 *
 * Lives on the client application (Report, Team, Marketing…).
 * No shared secret. Verification is delegated to the server's
 * `/auth/verify` endpoint (one network call per request, memoized) rather
 * than decoded locally: the previous local decode never actually checked
 * the RS256 signature (`$publicKey` was accepted but unused), a latent gap
 * closed by aligning on the same pattern already used by app-intranet's
 * AuthClient — and the only way an individual token revocation
 * (`users.tokens_revoked_at`, cf. auth_global migration 056) can take
 * effect immediately instead of waiting for local exp.
 */
class Broker
{
    use Immutable\With;

    /** URL of the auth_global server. */
    protected string $serverUrl;

    /** This application's slug (client id in oauth_clients). */
    protected string $appSlug;

    /** OAuth2 redirect URI (this broker's callback, must match oauth_clients.redirect_uri). */
    protected ?string $redirectUri = null;

    /** Server's public key for local JWT verification. */
    protected string $publicKey;

    /** The JWT token, stored in cookie or session. */
    protected ?string $jwt = null;

    /** Decoded JWT claims cache (from the last /auth/verify call). */
    protected ?array $claims = null;

    /** null = not yet checked against /auth/verify this request; bool = result. */
    protected ?bool $remoteVerified = null;

    /** @var \ArrayAccess<string,mixed> */
    protected \ArrayAccess $state;

    protected bool $initialized = false;

    protected ?Curl $curl = null;

    /**
     * @param string $serverUrl  URL of the auth_global server (e.g. https://auth.media-start.fr)
     * @param string $appSlug    This app's slug (report, team, marketing…)
     * @param string $publicKey  RS256 public key (PEM) for local JWT verification
     */
    public function __construct(
        string $serverUrl,
        string $appSlug,
        string $publicKey,
    ) {
        if (!(bool) preg_match("~^https?://~", $serverUrl)) {
            throw new \InvalidArgumentException(
                "Invalid SSO server URL '$serverUrl'",
            );
        }

        if ((bool) preg_match("/\W/", $appSlug)) {
            throw new \InvalidArgumentException(
                "Invalid app slug '$appSlug': must be alphanumeric",
            );
        }

        $this->serverUrl = rtrim($serverUrl, "/");
        $this->appSlug = $appSlug;
        $this->publicKey = $publicKey;
        $this->state = new Cookies();
    }

    /**
     * Get a copy with a different handler for persisting the JWT (cookie or session).
     */
    public function withTokenIn(\ArrayAccess $handler): self
    {
        return $this->withProperty("state", $handler);
    }

    /**
     * Set a custom wrapper for cURL.
     */
    public function withCurl(Curl $curl): self
    {
        return $this->withProperty("curl", $curl);
    }

    /**
     * Set this broker's OAuth2 callback URI (must match the registered
     * redirect_uri of the client in oauth_clients).
     */
    public function withRedirectUri(string $uri): self
    {
        return $this->withProperty("redirectUri", $uri);
    }

    /**
     * Get this app's slug.
     */
    public function getAppSlug(): string
    {
        return $this->appSlug;
    }

    // ============================================================
    // AUTH FLOW
    // ============================================================

    /**
     * Get the OAuth2 authorization URL to redirect the user to
     * (Authorization Code + PKCE). Generates and stores a PKCE verifier and a
     * CSRF state; encodes $returnUrl so the callback can resume.
     *
     * @param string   $returnUrl  Where to redirect after successful login
     * @param string[] $scopes     Requested scopes (default: profile)
     */
    public function getLoginUrl(
        string $returnUrl,
        array $scopes = ["profile"],
    ): string {
        $redirectUri = $this->redirectUri ?? $returnUrl;

        $verifier = $this->base64Url(random_bytes(48));
        $challenge = $this->base64Url(hash("sha256", $verifier, true));
        $state = bin2hex(random_bytes(16));

        $this->state[$this->getCookieName("verifier")] = $verifier;
        $this->state[$this->getCookieName("state")] = $state;
        $this->state[$this->getCookieName("return")] = $returnUrl;

        return $this->serverUrl .
            "/oauth/authorize?" .
            http_build_query([
                "response_type" => "code",
                "client_id" => $this->appSlug,
                "redirect_uri" => $redirectUri,
                "scope" => implode(" ", $scopes),
                "state" => $state,
                "code_challenge" => $challenge,
                "code_challenge_method" => "S256",
            ]);
    }

    /**
     * Handle the OAuth2 callback: exchange the authorization code for tokens
     * (with the stored PKCE verifier) and persist them. Falls back to a legacy
     * ?token= param for compatibility.
     *
     * @return string|null  The access token (JWT) on success, null otherwise
     */
    public function handleCallback(array $params): ?string
    {
        // ── OAuth2 Authorization Code flow ──
        if (isset($params["code"]) && $params["code"] !== "") {
            $expectedState =
                $this->state[$this->getCookieName("state")] ?? null;
            if (
                $expectedState === null ||
                ($params["state"] ?? null) !== $expectedState
            ) {
                return null; // CSRF / state mismatch
            }

            $verifier = $this->state[$this->getCookieName("verifier")] ?? "";
            $redirectUri =
                $this->redirectUri ??
                ($this->state[$this->getCookieName("return")] ?? "");

            $tokens = $this->postToken([
                "grant_type" => "authorization_code",
                "client_id" => $this->appSlug,
                "redirect_uri" => $redirectUri,
                "code_verifier" => $verifier,
                "code" => $params["code"],
            ]);

            unset(
                $this->state[$this->getCookieName("verifier")],
                $this->state[$this->getCookieName("state")],
            );

            return $this->storeTokens($tokens);
        }

        return null;
    }

    /**
     * Refresh the access token using the stored refresh token (silent renewal).
     *
     * @return bool  true if a new access token was obtained
     */
    public function refreshToken(): bool
    {
        $this->initialize();

        $refresh = $this->state[$this->getCookieName("refresh")] ?? null;
        if ($refresh === null || $refresh === "") {
            return false;
        }

        $tokens = $this->postToken([
            "grant_type" => "refresh_token",
            "client_id" => $this->appSlug,
            "refresh_token" => $refresh,
        ]);

        return $this->storeTokens($tokens) !== null;
    }

    /**
     * Check if the user is authenticated. Verified against the server's
     * `/auth/verify` (signature, expiry, revocation — cf. class docblock),
     * memoized per request.
     */
    public function isAuthenticated(): bool
    {
        $this->initialize();

        if ($this->jwt === null) {
            return false;
        }

        return $this->verifyRemote() !== null;
    }

    /**
     * Get the current user's claims, as returned by `/auth/verify`
     * (Server::getUserFromToken() shape — note "id" not "sub", "permissions"
     * not "perms", unlike the raw JWT claims this used to decode locally).
     *
     * @return array|null  { id, email, name, node_id, node_code, roles, permissions, … }
     */
    public function getUser(): ?array
    {
        $this->initialize();

        if ($this->jwt === null) {
            return null;
        }

        return $this->verifyRemote();
    }

    /**
     * Verify the stored JWT against the server, memoized for the lifetime
     * of this instance (one call per request regardless of how many times
     * isAuthenticated()/getUser()/hasPermission()/hasRole() are called).
     *
     * ⚠️ Token passed as a `?token=` QUERY PARAM, not an Authorization
     * header — verified end-to-end against preprod (2026-09-01): the header
     * form silently returns `{"valid":false}` on this server (getallheaders()
     * apparently unreliable under this FrankenPHP setup), while the query
     * param works. Same convention already used by app-intranet's
     * AuthClient::verify() — aligning on it here rather than chasing why the
     * header path fails server-side.
     */
    protected function verifyRemote(): ?array
    {
        if ($this->remoteVerified !== null) {
            return $this->remoteVerified ? $this->claims : null;
        }

        try {
            [
                "httpCode" => $httpCode,
                "contentType" => $contentType,
                "body" => $body,
            ] = $this->getCurl()->request(
                "GET",
                $this->getRequestUrl("/auth/verify", ["token" => $this->jwt]),
                ["Accept: application/json"],
                "",
            );
            $data = $this->handleResponse($httpCode, $contentType, $body);
        } catch (\Exception $e) {
            $this->remoteVerified = false;
            $this->claims = null;
            return null;
        }

        if (!is_array($data) || empty($data["valid"]) || !isset($data["user"]) || !is_array($data["user"])) {
            $this->remoteVerified = false;
            $this->claims = null;
            return null;
        }

        $this->remoteVerified = true;
        $this->claims = $data["user"];
        return $this->claims;
    }

    /**
     * Check if the current user has a specific permission.
     */
    public function hasPermission(string $permission): bool
    {
        $user = $this->getUser();
        if ($user === null) {
            return false;
        }

        // Server::getUserFromToken() (auth_global) names this key
        // "permissions", not "perms" — that was the raw JWT claim name back
        // when this class decoded the token locally; /auth/verify wraps it
        // differently.
        return in_array($permission, $user["permissions"] ?? [], true);
    }

    /**
     * Check if the current user has a specific role (local check).
     */
    public function hasRole(string $role): bool
    {
        $user = $this->getUser();
        if ($user === null) {
            return false;
        }

        return in_array($role, $user["roles"] ?? [], true);
    }

    /**
     * Clear the stored JWT (logout).
     */
    public function clearToken(): void
    {
        unset(
            $this->state[$this->getCookieName("jwt")],
            $this->state[$this->getCookieName("refresh")],
        );
        $this->jwt = null;
        $this->claims = null;
        $this->remoteVerified = null;
    }

    // ============================================================
    // BEARER TOKEN
    // ============================================================

    /**
     * Get the Bearer token for API requests.
     *
     * @throws NotAttachedException  if no valid JWT is stored
     */
    public function getBearerToken(): string
    {
        if (!$this->isAuthenticated()) {
            throw new NotAttachedException(
                "Not authenticated. Redirect the user to " .
                    $this->getLoginUrl("/"),
            );
        }

        return "Bearer " . $this->jwt;
    }

    // ============================================================
    // API REQUESTS
    // ============================================================

    /**
     * Send an HTTP request to the auth_global server.
     *
     * @param string                     $method  HTTP method: 'GET', 'POST', 'DELETE'
     * @param string                     $path    Relative path (e.g. '/auth/me')
     * @param array<string,mixed>|string $data    Query or post parameters
     * @return mixed  Decoded JSON response
     * @throws RequestException
     */
    public function request(string $method, string $path, $data = "")
    {
        // Toute méthode mutante (POST/PUT/PATCH/DELETE) envoie $data en corps
        // de requête ; seul GET le traite comme des query params. Avant ce
        // fix, seul POST envoyait un corps — un PUT (ex: update_objective)
        // se retrouvait avec $data collé en query string garbage sur l'URL
        // et un corps vide, d'où un "No fields to update" côté serveur.
        $hasBody = $method !== "GET";
        $url = $this->getRequestUrl($path, $hasBody ? "" : $data);
        $headers = [
            "Accept: application/json",
            "Authorization: " . $this->getBearerToken(),
        ];

        [
            "httpCode" => $httpCode,
            "contentType" => $contentType,
            "body" => $body,
        ] = $this->getCurl()->request(
            $method,
            $url,
            $headers,
            $hasBody ? $data : "",
        );

        return $this->handleResponse($httpCode, $contentType, $body);
    }

    /**
     * Get the full request URL for a path.
     */
    protected function getRequestUrl(string $path, $params = ""): string
    {
        $query = is_array($params) ? http_build_query($params) : $params;

        $base =
            $path[0] === "/"
                ? preg_replace("~^(\w+://[^/]+).*~", '$1', $this->serverUrl)
                : preg_replace('~/[^/]*$~', "", $this->serverUrl);

        return $base .
            "/" .
            ltrim($path, "/") .
            ($query !== "" ? "?" . $query : "");
    }

    /**
     * Handle the HTTP response.
     */
    protected function handleResponse(int $httpCode, $ctHeader, string $body)
    {
        if ($httpCode === 204) {
            return null;
        }

        [$contentType] = explode(";", (string) $ctHeader, 2);

        if ($contentType !== "application/json") {
            throw new RequestException(
                "Expected 'application/json' response, got '$contentType'",
                500,
                new RequestException($body, $httpCode),
            );
        }

        try {
            $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new RequestException(
                "Invalid JSON response from server",
                500,
                $exception,
            );
        }

        if ($httpCode >= 400) {
            throw new RequestException($data["error"] ?? $body, $httpCode);
        }

        return $data;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    protected function initialize(): void
    {
        if ($this->initialized) {
            return;
        }

        $this->jwt = $this->state[$this->getCookieName("jwt")] ?? null;
        $this->initialized = true;
    }

    protected function getCookieName(string $type): string
    {
        $slug = preg_replace("/[_\W]+/", "_", strtolower($this->appSlug));

        return "sso_{$type}_{$slug}";
    }

    /**
     * POST form-encoded params to the server's /oauth/token endpoint.
     *
     * @param array<string,mixed> $body
     * @return array<string,mixed>|null  Decoded token response, or null on error
     */
    protected function postToken(array $body): ?array
    {
        $headers = [
            "Accept: application/json",
            "Content-Type: application/x-www-form-urlencoded",
        ];

        try {
            [
                "httpCode" => $httpCode,
                "body" => $responseBody,
            ] = $this->getCurl()->request(
                "POST",
                $this->serverUrl . "/oauth/token",
                $headers,
                $body,
            );
        } catch (\Exception $e) {
            return null;
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            return null;
        }

        $data = json_decode($responseBody, true);

        return is_array($data) ? $data : null;
    }

    /**
     * Persist the access (and refresh) token from a token response.
     *
     * @param array<string,mixed>|null $tokens
     * @return string|null  The access token, or null if the response was invalid
     */
    protected function storeTokens(?array $tokens): ?string
    {
        if ($tokens === null || empty($tokens["access_token"])) {
            return null;
        }

        $this->jwt = $tokens["access_token"];
        $this->claims = null;
        $this->remoteVerified = null; // force a fresh /auth/verify for the new token
        $this->state[$this->getCookieName("jwt")] = $this->jwt;

        if (!empty($tokens["refresh_token"])) {
            $this->state[$this->getCookieName("refresh")] =
                $tokens["refresh_token"];
        }

        return $this->jwt;
    }

    /**
     * URL-safe base64 without padding (for PKCE).
     */
    protected function base64Url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), "+/", "-_"), "=");
    }

    /**
     * Get the cURL wrapper (lazy-loaded).
     */
    protected function getCurl(): Curl
    {
        if (!isset($this->curl)) {
            $this->curl = new Curl();
        }

        return $this->curl;
    }
}
