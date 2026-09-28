<?php

declare(strict_types=1);

/**
 * Proxy HTTP admin → server/ (ADR-010, Lot 4).
 *
 * Forwarde les appels du front React admin vers le serveur OAuth2 (SSO_SERVER)
 * avec le Bearer JWT extrait du cookie de session.
 *
 * Deux modes :
 *   1. ?action=X         → mapping legacy vers REST (ex: ?action=users → GET /users)
 *   2. /admin/proxy.php/chemin  → forward direct du path (ex: /admin/proxy.php/users)
 *
 * Auth : cookie ag_token (HttpOnly) → JWT → Bearer. Pas d'exposition côté JS.
 */

use MediaStart\Auth\Broker\Broker;
use MediaStart\Auth\Broker\RequestException;

require_once __DIR__ . "/../vendor/autoload.php";

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: " . ($_SERVER["HTTP_ORIGIN"] ?? "*"));
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Vary: Origin");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit();
}

// ── Auth ──────────────────────────────────────────────────
/** @var Broker $broker */
$broker = require __DIR__ . "/auth.php";

if (!$broker->isAuthenticated()) {
    http_response_code(401);
    echo json_encode(["error" => "Non authentifié"], JSON_UNESCAPED_UNICODE);
    exit();
}

// Vérifier au moins une des permissions d'accès admin
$hasAccess =
    $broker->hasPermission("admin_access") ||
    $broker->hasPermission("goals_access");

if (!$hasAccess) {
    http_response_code(403);
    echo json_encode(["error" => "Accès refusé"], JSON_UNESCAPED_UNICODE);
    exit();
}

// ── Mapping action → REST (méthode + path) ────────────────
// Les actions legacy (?action=X) sont traduites en appels REST vers server/.
// Format : 'action' => ['METHOD', '/path']
$actionMap = [
    // Auth — 'me' : claims JWT bruts + manage_all/managed_node_ids (enrichis
    // par le serveur, cf. GET /me). Sonde d'auth de la SPA.
    "me" => ["GET", "/me"],

    "grades" => ["GET", "/grades"],

    // Users — domaine porté en Doctrine (server/, UserController). Contrat de
    // body inchangé : create_user/update_user/delete_user passent l'id dans le
    // body (résolu en _ID_) ; assign/unassign/manager/grade portent user_id ou
    // assignment_id dans le body vers des routes /users/assignments*.
    "users" => ["GET", "/users"],
    "user_duplicates" => ["GET", "/users/duplicates"],
    "user" => ["GET", "/users/_ID_"],
    "create_user" => ["POST", "/users"],
    "update_user" => ["PUT", "/users/_ID_"],
    "set_user_password" => ["PUT", "/users/_ID_/password"],
    "regenerate_user_password" => ["POST", "/users/_ID_/regenerate-password"],
    // Déconnexion forcée : révoque tous les tokens émis sans désactiver le
    // compte (finding C8, cf. TokenRevoker côté auth_global).
    "revoke_user_tokens" => ["POST", "/users/_ID_/revoke-tokens"],
    "delete_user" => ["DELETE", "/users/_ID_"],
    "assign_user" => ["POST", "/users/assignments"],
    "unassign_user" => ["DELETE", "/users/assignments"],
    "set_node_manager" => ["POST", "/users/assignments/manager"],
    "set_assignment_grade" => ["PUT", "/users/assignments/grade"],

    // Adresses professionnelles secondaires (migration 052, onglet Identité).
    // _ID_ = l'utilisateur (comme "user" ci-dessus) ; _PRO_ = la ligne
    // user_pro_emails ciblée par la désactivation.
    "user_pro_emails" => ["GET", "/users/_ID_/pro-emails"],
    "create_user_pro_email" => ["POST", "/users/_ID_/pro-emails"],
    "delete_user_pro_email" => ["DELETE", "/users/_ID_/pro-emails/_PRO_"],

    // Apps CRUD
    // 'apps_with_roles' → route dédiée renvoyant l'arbre imbriqué
    // roles[]+permissions[] (AppController::indexWithRoles), distincte de
    // 'apps' (GET /apps, counts only pour la liste de gestion).
    "apps_with_roles" => ["GET", "/apps-with-roles"],
    "apps" => ["GET", "/apps"],
    "app" => ["GET", "/apps/_ID_"],
    "create_app" => ["POST", "/apps"],
    "update_app" => ["PUT", "/apps/_ID_"],
    "delete_app" => ["DELETE", "/apps/_ID_"],
    // Régénère le secret OAuth2 confidentiel d'une app (reveal unique côté front).
    "regenerate_app_secret" => ["POST", "/apps/_ID_/secret"],

    // Architecture — position libre sur le canvas + connexions entre apps
    // (migration 023, page /architecture). _ID_ résolu depuis body.id.
    "update_app_position" => ["PUT", "/apps/_ID_/position"],
    "app_connections" => ["GET", "/app-connections"],
    "create_app_connection" => ["POST", "/app-connections"],
    "delete_app_connection" => ["DELETE", "/app-connections/_ID_"],

    // Roles
    "role" => ["GET", "/apps/_APP_/roles/_ID_"],
    "create_role" => ["POST", "/apps/_APP_/roles"],
    "update_role" => ["PUT", "/apps/_APP_/roles/_ID_"],
    "delete_role" => ["DELETE", "/apps/_APP_/roles/_ID_"],
    "permissions" => ["GET", "/apps/_APP_/permissions"],
    "create_permission" => ["POST", "/apps/_APP_/permissions"],
    "update_permission" => ["PUT", "/apps/_APP_/permissions/_ID_"],
    "delete_permission" => ["DELETE", "/apps/_APP_/permissions/_ID_"],
    "attach_permission" => ["POST", "/apps/_APP_/role-permissions"],
    "detach_permission" => ["DELETE", "/apps/_APP_/role-permissions"],

    // Role assignments (user_app_roles) + Grants (user_app_grants).
    // Le user cible passe par _USER_ (body user_id → segment de path). Les
    // grants réutilisent createGrant/deleteGrant (app_id accepté en alias de
    // app_slug) ; les rôles pointent vers des routes app-roles dédiées portant
    // le contrat console admin (app_role_id + fermeture de tout rôle actif),
    // distinct du contrat REST role_name de /users/:id/roles.
    "assign_app_role" => ["POST", "/users/_USER_/app-roles"],
    "revoke_app_role" => ["DELETE", "/users/_USER_/app-roles/_ID_"],
    "upsert_app_grant" => ["POST", "/users/_USER_/grants"],
    "delete_app_grant" => ["DELETE", "/users/_USER_/grants"],

    // Payfit — configurations multi-entreprise + synchro manuelle (AUT-8)
    "payfit_companies" => ["GET", "/payfit-companies"],
    "create_payfit_company" => ["POST", "/payfit-companies"],
    "update_payfit_company" => ["PUT", "/payfit-companies/_ID_"],
    "delete_payfit_company" => ["DELETE", "/payfit-companies/_ID_"],
    "sync_payfit_company" => ["POST", "/payfit-companies/_ID_/sync"],

    // Auth
    "set_password" => ["POST", "/auth/set-password"],
];

// ── Résoudre la cible ─────────────────────────────────────
$method = $_SERVER["REQUEST_METHOD"];
$action = $_GET["action"] ?? "";
$body = file_get_contents("php://input");
$input = json_decode($body, true) ?? [];

// Si un path direct est donné après /admin/proxy.php, on le forwarde tel quel
$requestUri = $_SERVER["REQUEST_URI"];
$proxyPrefix = "/admin/proxy.php";
$pos = strpos($requestUri, $proxyPrefix);
$directPath = "";

if ($pos !== false) {
    $afterPrefix = substr($requestUri, $pos + strlen($proxyPrefix));
    // Ignorer ?action=... et autres query params du path extrait
    $qPos = strpos($afterPrefix, "?");
    $directPath =
        $qPos !== false ? substr($afterPrefix, 0, $qPos) : $afterPrefix;
    $directPath = rtrim($directPath, "/");
}

// Mode 1 : path direct (ex: /admin/proxy.php/users)
if ($directPath !== "" && $directPath !== "/" && $action === "") {
    // Conserver la query string (sauf action)
    $qs = $_GET;
    unset($qs["action"]);
    $queryString = http_build_query($qs);
    $targetPath = $directPath . ($queryString !== "" ? "?" . $queryString : "");

    [$status, $responseBody] = forward($broker, $method, $targetPath, $body);
    http_response_code($status);
    echo $responseBody;
    exit();
}

// Mode 2 : action legacy (ex: ?action=users&id=5)
if ($action !== "" && isset($actionMap[$action])) {
    [$targetMethod, $targetPath] = $actionMap[$action];

    // Remplacer les placeholders _ID_, _APP_, _ROLE_ par les valeurs des query params / body
    $replacements = [
        "_ID_" => (string) ($input["id"] ?? ($_GET["id"] ?? "")),
        "_USER_" => (string) ($input["user_id"] ?? ($_GET["user_id"] ?? "")),
        "_APP_" => (string) ($input["app_id"] ?? ($_GET["app_id"] ?? "")),
        "_ROLE_" =>
            (string) ($input["app_role_id"] ??
                ($input["role_id"] ?? ($_GET["role_id"] ?? ""))),
        "_PRO_" =>
            (string) ($input["pro_email_id"] ?? ($_GET["pro_email_id"] ?? "")),
    ];

    foreach ($replacements as $ph => $val) {
        if (str_contains($targetPath, $ph)) {
            $targetPath = str_replace($ph, $val, $targetPath);
        }
    }

    // Ajouter les query params (sauf action, id, app_id, role_id qui sont déjà dans le path)
    $qs = $_GET;
    unset(
        $qs["action"],
        $qs["id"],
        $qs["user_id"],
        $qs["app_id"],
        $qs["role_id"],
        $qs["pro_email_id"],
    );
    // Pour les endpoints qui attendent des query params (ex: transactions?start=&end=)
    // on les passe dans la query string
    $queryString = http_build_query($qs);
    $targetPath .= $queryString !== "" ? "?" . $queryString : "";

    // Si le body contient les données métier, on l'envoie
    $forwardBody = !empty($input) ? json_encode($input) : "";

    [$status, $responseBody] = forward(
        $broker,
        $targetMethod,
        $targetPath,
        $forwardBody,
    );
    http_response_code($status);
    echo $responseBody;
    exit();
}

// Action inconnue → 400 JSON. Le fallback vers l'API legacy
// (admin/api/index.php) a été RETIRÉ : toutes les actions de la console admin
// sont désormais routées vers server/ Doctrine ci-dessus (le SSE a été
// remplacé par du polling, cf. use-unread-count.ts). Plan de suppression
// legacy, phase 5.
http_response_code(400);
echo json_encode(
    ["error" => "Action inconnue: $action"],
    JSON_UNESCAPED_UNICODE,
);
exit();

// ── Helper ─────────────────────────────────────────────────
function forward(
    Broker $broker,
    string $method,
    string $path,
    string $body,
): array {
    try {
        $result = $broker->request($method, $path, $body !== "" ? $body : "");
        return [200, json_encode($result, JSON_UNESCAPED_UNICODE)];
    } catch (RequestException $e) {
        $code = $e->getCode() ?: 500;
        return [
            $code,
            json_encode(["error" => $e->getMessage()], JSON_UNESCAPED_UNICODE),
        ];
    } catch (\Throwable $e) {
        return [
            500,
            json_encode(["error" => $e->getMessage()], JSON_UNESCAPED_UNICODE),
        ];
    }
}
