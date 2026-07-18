<?php

declare(strict_types=1);

/**
 * Callback OAuth2 de la console admin : échange le code (PKCE) contre les
 * tokens, les stocke en cookie, puis renvoie vers l'admin.
 */

use MediaStart\Auth\Broker\Broker;

/** @var Broker $broker */
$broker = require __DIR__ . "/auth.php";

$token = $broker->handleCallback($_GET);

if ($token === null) {
    http_response_code(401);
    echo "Échec de l'authentification (code invalide ou state incohérent). " .
        '<a href="login.php">Réessayer</a>';
    exit();
}

// Destination post-login : le Vite dev server en dev (DEV_RETURN_URL),
// sinon la SPA servie par PHP ('/').
$returnUrl = getenv('DEV_RETURN_URL') ?: '/';
header("Location: $returnUrl");
exit();
