<?php

declare(strict_types=1);

/**
 * Déconnexion de la console admin : révoque le token (OAuth2) + efface le cookie.
 */

use MediaStart\Auth\Broker\Broker;

/** @var Broker $broker */
$broker = require __DIR__ . '/auth.php';

if ($broker->isAuthenticated()) {
    try {
        $broker->request('POST', '/oauth/revoke');
    } catch (\Throwable $e) {
        // token déjà invalide côté serveur : on efface quand même le cookie
    }
    $broker->clearToken();
}

header('Location: login.php');
exit();
