<?php
/**
 * Router php -S pour le serveur admin (port 8003).
 * SPA servie à la racine — History API routing : /users, /apps, etc. → dist/index.html.
 * L'auth est gérée côté SPA (AuthGate → /admin/api/me → 401 → redirect login.php).
 * Usage : php -S 0.0.0.0:8003 docker/admin-router.php
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Fichiers PHP (login, callback, logout, api…) → comportement par défaut
if (preg_match('/\.php$/', $uri)) {
    return false;
}

// Assets statiques (JS, CSS, fonts…) — servis depuis {repo-root}/dist/.
// Le docroot du serveur intégré est le repo-root (pour que les fichiers PHP
// ci-dessus se résolvent à leur vrai chemin), donc `return false` ne marche
// pas ici : il faut lire le fichier depuis dist/ explicitement.
if (preg_match('/\.([a-z0-9]+)$/i', $uri, $m) && in_array(strtolower($m[1]), ['js', 'css', 'woff', 'woff2', 'png', 'jpg', 'ico', 'svg', 'map', 'json', 'txt'], true)) {
    $asset = __DIR__ . '/../dist' . $uri;
    if (!is_file($asset)) {
        http_response_code(404);
        return true;
    }
    $mimes = [
        'js' => 'application/javascript', 'css' => 'text/css',
        'woff' => 'font/woff', 'woff2' => 'font/woff2',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'ico' => 'image/x-icon',
        'svg' => 'image/svg+xml', 'map' => 'application/json',
        'json' => 'application/json', 'txt' => 'text/plain',
    ];
    header('Content-Type: ' . ($mimes[strtolower($m[1])] ?? 'application/octet-stream'));
    readfile($asset);
    return true;
}

// Toutes les routes SPA → dist/index.html (auth gérée par la SPA)
$html = __DIR__ . '/../dist/index.html';
if (!is_file($html)) {
    http_response_code(503);
    echo 'Build absent. Lance `npm run build` dans admin/front/.';
    return true;
}
header('Content-Type: text/html; charset=utf-8');
readfile($html);
return true;
