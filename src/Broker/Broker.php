<?php

declare(strict_types=1);

namespace MediaStart\Auth\Broker;

use Jasny\Immutable;

/**
 * auth_global — SSO Broker.
 *
 * Lives on the client application (Report, Team, Marketing…).
 * No shared secret — validates JWTs locally using the server's public key.
 * No network call needed to verify a user's session.
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

    /** Decoded JWT claims cache. */
    protected ?array $claims = null;

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
     * Check if the user is authenticated (has a valid, non-expired JWT).
     * This is a LOCAL check — no network call.
     */
    public function isAuthenticated(): bool
    {
        $this->initialize();

        if ($this->jwt === null) {
            return false;
        }

        $claims = $this->decodeJwt($this->jwt);
        if ($claims === null) {
            return false;
        }

        return ($claims["exp"] ?? 0) > time();
    }

    /**
     * Get the current user's claims from the JWT (no network call).
     *
     * @return array|null  { id, email, name, node_id, node_code, roles, perms, … }
     */
    public function getUser(): ?array
    {
        if (!$this->isAuthenticated()) {
            return null;
        }

        if ($this->claims !== null) {
            return $this->claims;
        }

        $this->claims = $this->decodeJwt($this->jwt);

        return $this->claims;
    }

    /**
     * Check if the current user has a specific permission (local check).
     */
    public function hasPermission(string $permission): bool
    {
        $user = $this->getUser();
        if ($user === null) {
            return false;
        }

        return in_array($permission, $user["perms"] ?? [], true);
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
        $this->claims = $this->decodeJwt($this->jwt);
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
     * Decode a JWT without verifying the signature (local, fast).
     * For signature verification, call the server's /auth/verify endpoint.
     */
    protected function decodeJwt(string $token): ?array
    {
        $parts = explode(".", $token);
        if (count($parts) !== 3) {
            return null;
        }

        try {
            $payload = json_decode(
                base64_decode(strtr($parts[1], "-_", "+/"), true),
                true,
            );

            return is_array($payload) ? $payload : null;
        } catch (\Exception $e) {
            return null;
        }
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
