<?php

declare(strict_types=1);

/**
 * Démarre le flux OAuth2 de la console admin (Authorization Code + PKCE).
 * Les identifiants sont saisis sur le serveur d'autorisation.
 */

use MediaStart\Auth\Broker\Broker;

/** @var Broker $broker */
$broker = require __DIR__ . '/auth.php';

if ($broker->isAuthenticated() && $broker->hasPermission(ADMIN_PERM)) {
    header('Location: front/');
    exit();
}

header('Location: ' . admin_public_login_url($broker, $serverUrl, $serverUrlPublic, 'front/', ['admin_access', 'profile']));
exit();
