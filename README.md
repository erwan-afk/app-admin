# app-admin

Console d'administration du groupe (users, rôles, clients OAuth2, architecture, transactions) — extraite d'`auth_global` le 2026-07-18 (`Projects/app-admin/` dans le vault pour l'historique complet du chantier en 3 phases).

Aucune base de données locale : ce repo est un client OAuth2 mince (Authorization Code + PKCE) qui parle exclusivement en HTTP à `auth_global` (le serveur d'autorisation).

## Dev local

```bash
docker compose up -d --build
```

Nécessite le réseau Docker externe `docker_default` (celui d'`auth_global/docker/docker-compose.yml`, qui doit déjà tourner). Sert sur `http://localhost:8015`.

Variables d'env (voir `docker-compose.yml`) :
- `SSO_SERVER` — URL interne (container-à-container) du serveur OAuth2
- `SSO_SERVER_PUBLIC` — URL publique (celle que le navigateur suit) — **distincte de `SSO_SERVER`**, cf. commentaire dans `admin/auth.php`
- `ADMIN_REDIRECT_URI` — doit correspondre exactement au `redirect_uri` du client OAuth2 `admin` en base

## Déploiement — reste à faire (pas fait dans ce chantier)

Ce repo n'a **aucun déploiement Coolify configuré**. À faire manuellement :

1. Créer une nouvelle application Coolify, source = ce repo GitHub (`erwan-afk/app-admin`, branche `main`), build = `Dockerfile` à la racine.
2. Variables d'env Coolify à poser :
   - `SSO_SERVER` = URL publique prod d'auth_global (les deux appels — navigateur et serveur — convergent vers la même URL en prod, pas de séparation nécessaire comme en dev)
   - `SSO_SERVER_PUBLIC` = même valeur que `SSO_SERVER` en prod
   - `ADMIN_REDIRECT_URI` = `https://<domaine-app-admin>/admin/callback.php`
3. Mettre à jour `oauth_clients.redirect_uri` du client `admin` (auth_global, en base **prod**) avec cette même URL — actuellement il pointe vers `http://localhost:8015/admin/callback.php` (dev seulement, migration `038_admin_client_redirect_auth_admin.sql` côté auth_global).
4. `keys/public.pem` doit être la même clé publique que celle d'auth_global prod (pas de clé privée nécessaire ici, ce repo ne signe jamais de JWT — il les décode seulement).
5. CI GitHub Actions (`.github/workflows/ci.yml`) build/lint/test sur push — ne déploie rien automatiquement (pas de step Coolify webhook, contrairement à `auth_global/.gitlab-ci.yml` qui en avait un). À ajouter si un déploiement continu est voulu.

## Ce qui n'est PAS ici

- Organigramme, Objectifs, Objectifs Groupe, OKR — domaine Pilotage, désormais dans [app-objectifs](https://github.com/erwan-afk/app-objectifs) (ou l'équivalent GitLab une fois débloqué).
- Toute logique métier autre que users/rôles/clients OAuth2/transactions/architecture.
