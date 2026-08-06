<?php

declare(strict_types=1);

/**
 * Bootstrap OAuth2 + gate d'autorisation de la console admin.
 *
 * La console est un client OAuth2 ('admin'). Le token (JWT RS256) est vérifié
 * LOCALEMENT avec la clé publique ; l'accès exige la permission 'admin_access'.
 *
 * Usage :
 *   $broker = require __DIR__ . '/auth.php';   // (ou '/../auth.php' depuis api/)
 *   admin_guard_ui($broker);    // pages HTML  → redirige / 403
 *   admin_guard_api($broker);   // endpoints   → 401 / 403 JSON
 *
 * @return \MediaStart\Auth\Broker\Broker
 */

use MediaStart\Auth\Broker\Broker;
use MediaStart\Auth\Broker\Cookies;

require_once __DIR__ . '/../vendor/autoload.php';

const ADMIN_PERM = 'admin_access';
// Rôle restreint : accès uniquement à la page Objectifs (répartition),
// sans le reste de la console (cf. migrations/013_admin_goals_role.sql).
const GOALS_PERM = 'goals_access';

// ⚠️ DEUX URLs distinctes (extraction en repo dédié, 2026-07-18) — l'admin
// tournait auparavant en network_mode:service:auth (partage du netns
// d'ag_auth), donc une seule URL (localhost:8000) marchait pour le
// navigateur ET les appels serveur-à-serveur. Séparé maintenant en repo/
// conteneur propre, il faut les deux (même pattern que app-objectifs/
// digicertif-admin, cf. oauth.php de ces repos) :
//   SSO_SERVER_PUBLIC   URL suivie par le NAVIGATEUR (redirection /oauth/authorize)
//   SSO_SERVER          URL tapée par CE CONTENEUR (token, revoke, proxy API)
$serverUrl       = getenv('SSO_SERVER') ?: 'http://localhost:8000';
$serverUrlPublic = getenv('SSO_SERVER_PUBLIC') ?: $serverUrl;
$redirectUri     = getenv('ADMIN_REDIRECT_URI') ?: 'http://localhost:8003/admin/callback.php';
$publicKey       = file_get_contents(__DIR__ . '/../keys/public.pem');

$adminBroker = (new Broker($serverUrl, 'admin', $publicKey))
    ->withTokenIn(new Cookies(28800, '/'))
    ->withRedirectUri($redirectUri);

/**
 * URL de login à donner au NAVIGATEUR — getLoginUrl() construit sur l'URL
 * interne (ex. http://auth:8000) pour ses effets de bord (cookies PKCE), on
 * réécrit juste l'hôte vers l'URL publique pour la redirection réelle. Relit
 * les env vars plutôt que de les recevoir en paramètre : $serverUrl/
 * $serverUrlPublic ci-dessus ne sont visibles que par partage implicite de
 * scope via `require` (fragile, signalé par phpstan) — une fonction reste
 * fiable quel que soit l'appelant.
 */
function admin_public_login_url(Broker $broker, string $returnUrl, array $scopes): string
{
    $serverUrl = getenv('SSO_SERVER') ?: 'http://localhost:8000';
    $serverUrlPublic = getenv('SSO_SERVER_PUBLIC') ?: $serverUrl;
    $url = $broker->getLoginUrl($returnUrl, $scopes);
    return $serverUrl === $serverUrlPublic ? $url : substr_replace($url, $serverUrlPublic, 0, strlen($serverUrl));
}

/**
 * true si le broker porte l'une des permissions qui ouvrent la console
 * admin (accès complet OU rôle restreint Objectifs).
 */
function admin_has_any_access(Broker $broker): bool
{
    return $broker->hasPermission(ADMIN_PERM) || $broker->hasPermission(GOALS_PERM);
}

/**
 * App vers laquelle renvoyer un compte authentifié SANS droit sur la console
 * (2026-08-06) : Atlas, à laquelle tout le monde a accès — son modèle de droits
 * est positionnel (un rattachement actif suffit, `user_app_grants` est vide pour
 * le client `intranet`), là où la console admin exige `admin_access`.
 *
 * Avant, ce cas produisait une impasse : « Accès refusé » sans aucune sortie.
 * Ethibaud, le 2026-08-06 : « tout le monde qui va se connecter va se prendre
 * cette erreur, c'est pas du tout le but ».
 *
 * Surchargeable par `ATLAS_URL` (dev local, préprod). Retourne null si la cible
 * est le host courant — sans ça, une valeur mal configurée boucle indéfiniment.
 */
function admin_fallback_app_url(): ?string
{
    $url = rtrim((string) (getenv('ATLAS_URL') ?: 'https://atlas.groupebenoitboitard.com'), '/');
    if ($url === '') {
        return null;
    }
    $target = parse_url($url, PHP_URL_HOST);
    $current = $_SERVER['HTTP_HOST'] ?? '';
    if ($target === null || ($current !== '' && strcasecmp((string) $target, (string) $current) === 0)) {
        return null;
    }
    return $url;
}

/**
 * Gate pour les pages HTML : non connecté → redirige vers le login OAuth ;
 * sans 'admin_access' ni 'goals_access' → renvoi vers Atlas (cf.
 * admin_fallback_app_url()), et seulement à défaut une page 403.
 */
function admin_guard_ui(Broker $broker): void
{
    if (!$broker->isAuthenticated()) {
        header('Location: /admin/login.php');
        exit();
    }

    if (!admin_has_any_access($broker)) {
        // Ne PAS laisser l'utilisateur en cul-de-sac : la console admin n'est
        // pas le point d'entrée du groupe, Atlas l'est.
        $fallback = admin_fallback_app_url();
        if ($fallback !== null) {
            header('Location: ' . $fallback);
            exit();
        }

        http_response_code(403);
        header('Content-Type: text/html; charset=utf-8');
        $user = $broker->getUser();
        $email = htmlspecialchars((string) ($user['email'] ?? ''));
        // Liens en chemins ABSOLUS : ce guard sert aussi la SPA depuis
        // /admin/front/, où un "logout.php" relatif pointerait sur
        // /admin/front/logout.php (404).
        echo "<!doctype html><meta charset=utf-8><title>403 — Accès refusé</title>"
            . "<div style=\"font-family:sans-serif;max-width:420px;margin:80px auto;text-align:center\">"
            . "<h2>403 — Accès refusé</h2>"
            . "<p>Le compte <strong>$email</strong> n'a pas la permission "
            . "<code>admin_access</code> ni <code>goals_access</code>.</p>"
            . "<p><a href=\"/admin/logout.php\">Changer de compte</a></p></div>";
        exit();
    }
}

/**
 * Claims du JWT de l'utilisateur courant (sub, email, perms, is_codir…).
 * À n'appeler qu'après un guard. Retourne [] si non authentifié.
 */
function admin_current_user(Broker $broker): array
{
    return $broker->getUser() ?? [];
}

/**
 * Gate pour l'API : non connecté → 401 JSON ; sans 'admin_access' ni
 * 'goals_access' → 403 JSON. L'allowlist d'actions pour les comptes
 * goals_access-only (sans admin_access) est appliquée par le routeur
 * (admin/api/index.php), pas ici.
 */
function admin_guard_api(Broker $broker): void
{
    if (!$broker->isAuthenticated()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Non authentifié']);
        exit();
    }

    if (!admin_has_any_access($broker)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        // `redirect_url` (2026-08-06) : la SPA sait déjà l'exploiter — elle
        // bascule alors sur l'écran « redirection… » au lieu de l'impasse
        // « Accès refusé » (AuthContext.tsx, `status === "redirect"`). Ce
        // chemin existait depuis ADR-008 mais aucun serveur ne renvoyait plus
        // la clé : le front avait un cas mort.
        echo json_encode(array_filter([
            'error' => 'Accès admin requis (admin_access ou goals_access)',
            'redirect_url' => admin_fallback_app_url(),
        ], static fn($v) => $v !== null));
        exit();
    }
}

return $adminBroker;
