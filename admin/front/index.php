<?php
/**
 * Point d'entrée du nouvel admin (SPA React + shadcn).
 * URL : http://localhost:8003/
 *
 * Même gate OAuth2 que l'admin vanilla : exige la permission 'admin_access'.
 * Une fois authentifié, sert le build Vite (dist/index.html).
 */
declare(strict_types=1);

$broker = require __DIR__ . '/../auth.php';

// admin_guard_ui() redirige vers 'login.php' en relatif → KO depuis /admin/front/.
// On gère donc la redirection login en absolu ; le guard ne traite plus que le 403.
if (!$broker->isAuthenticated()) {
    header('Location: /admin/login.php');
    exit();
}
admin_guard_ui($broker);

$dist = __DIR__ . '/../../dist/index.html';
if (!is_file($dist)) {
    http_response_code(503);
    echo "Build absent. Lance `npm run build` dans admin/front/.";
    exit;
}

header('Content-Type: text/html; charset=utf-8');
readfile($dist);
