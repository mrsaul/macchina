@AGENTS.md

# Roast Copilot

Assistant open source pour comprendre et piloter des torréfacteurs à café.
Première machine supportée : **Stronghold S7X**.

L'utilisateur parle (voix) ou écrit ; l'assistant répond en s'appuyant sur la
base de connaissances propre à la machine sélectionnée — un **machine pack** JSON.

> État : socle UI (Next.js + design system VIBE) en place. Pas encore de logique métier.

---

## Principes non négociables

1. **Lecture ouverte, écriture contrôlée.** Tout le monde peut lire et interroger.
   Écrire est réservé à des rôles :
   - `lecteur` — lit, pose des questions (rôle par défaut, y compris anonyme).
   - `contributeur` — propose des ajouts/modifications de packs (soumis à revue).
   - `mainteneur` — valide, publie une version de pack, valide le contenu `safety`.
   Les droits sont appliqués **en base via RLS Supabase**, jamais seulement côté UI.

2. **Connaissance séparée de l'app.** Chaque machine = un pack JSON versionné
   (semver) dans `packs/<machine-id>.json`. L'app ne contient aucune connaissance
   machine en dur. Un pack est validé par un schéma (JSON Schema / Zod) avant publication.

3. **Moteur d'IA interchangeable.** Tout appel LLM passe par une interface
   `AIProvider` (`lib/ai/`). Anthropic est l'implémentation par défaut, appelée
   **uniquement côté serveur**. Aucun composant ni route ne doit importer un SDK
   fournisseur directement.

4. **Sécurité d'abord.** Tout contenu touchant chaleur, incendie, températures,
   pression gaz, limites machine est marqué `"safety": true`. Ce contenu :
   - exige la validation d'un mainteneur avant publication ;
   - est affiché avec un bandeau d'avertissement distinct ;
   - n'est jamais « inventé » par le modèle : si le pack ne couvre pas la question,
     l'assistant le dit et renvoie au manuel constructeur.

---

## Stack

- **Next.js 16** (App Router, `src/`) + **TypeScript** (strict) + **Tailwind CSS v4**
- **Supabase** : Auth, Postgres, Row Level Security
- **API Anthropic** côté serveur (Route Handlers / Server Actions), clé jamais exposée au client
- Déploiement **Vercel**

⚠️ Ne pas développer dans `~/Documents` (synchro iCloud → `next dev`/`build` bloquent).
Le projet vit dans `~/dev/roast-copilot`.

---

## Style visuel — « VIBE »

| Élément | Règle |
|---|---|
| Fond | papier crème `#EDEAE0` |
| Encre | noir `#15140F` |
| Typo | **tout** en monospace — Space Mono |
| Libellés | MAJUSCULES |
| Étiquettes | blocs noirs inversés (texte crème sur noir) |
| Angles | durs, `border-radius: 0` partout |
| Filets | noirs, `1.5px` |
| Boutons d'action | bloc noir plein, texte crème |
| Mode sombre | inversion pure : crème sur noir |

Pas d'ombres, pas de dégradés, pas d'arrondis.

### Implémentation

- Tailwind v4 : **pas de `tailwind.config`**. Les tokens sont déclarés dans
  `src/app/globals.css` (variables CSS + bloc `@theme inline`).
- Tokens : `paper`, `ink`, `muted`, `line`, `panel` → classes `bg-paper`,
  `text-ink`, `border-line`, etc. Filet : `border-rule` (1.5px).
- Thème : `prefers-color-scheme` par défaut, forçable via `data-theme="light|dark"`
  sur `<html>` (bouton `ThemeToggle`, préférence en `localStorage`, script
  anti-flash dans `layout.tsx`).
- Composants VIBE dans `src/components/ui/` : `Tag`, `Chip`, `ActionButton`.
  Toujours les réutiliser plutôt que recréer des styles ad hoc.

---

## Base de données (Supabase)

- Schéma : `supabase/migrations/` — tables `machines`, `contributions`, `memberships`.
- Les rôles sont **par machine** (`memberships.role` : `reader` / `contributor` / `maintainer`).
  Vérification dans les policies via `private.has_machine_role()` (security definer,
  hors du schéma `public` exposé par l'API).
- RLS sur `contributions` : `approved` lisible par tous (anonymes inclus) ; un auteur
  voit toutes ses propositions ; les mainteneurs voient tout sur leurs machines ;
  insertion en `proposed` par contributor/maintainer ; mise à jour (revue, texte)
  par maintainer uniquement ; aucune suppression côté client.
- Un trigger impose `reviewed_by`/`reviewed_at` côté serveur et rend `id`,
  `machine_id`, `proposed_by`, `created_at` immuables. Un rejet exige `reason`.
- `machines` et `memberships` ne sont jamais écrits par le client (service role / SQL).
- `machines.pack` est une **copie** de `packs/<id>.json`. Après modification d'un pack :
  `npm run db:seed` régénère `supabase/seed.sql` (ne jamais l'éditer à la main).
- **Toute modification de policy doit passer `npm run test:db`** (tests RLS sur
  PGlite, sans Docker) ; ajouter un test pour chaque nouvelle règle.
- Types générés : `npm run db:types` après chaque migration (`database.types.ts`).
- Config Auth distante pilotée par `supabase/config.toml` (`supabase config push`).
  **Toujours lire le diff avant de confirmer** : les valeurs par défaut locales
  (MFA désactivé, `max_frequency` à 1 s…) affaibliraient le projet distant.
  `config.toml` est aligné sur le distant ; URLs de retour autorisées : `localhost:3100`.
  Ajouter l'URL de production Vercel le moment venu.

## Authentification

- Lien magique par e-mail (`/login`) → retour sur `/auth/callback`, qui gère les
  deux formats de lien (`code` PKCE par défaut, `token_hash` si template personnalisé).
  Le paramètre `next` passe par `safeNextPath()` (pas de redirection externe).
- Pas de compte = lecture seule (« Continuer sans compte »). On n'utilise pas les
  *anonymous sign-ins* Supabase : un visiteur non connecté est simplement `anon`.
- `AuthProvider` (layout) partage l'utilisateur ; `useUser()` pour le lire.
- `useRole(machineId)` → `{ role, loading }`, `reader` par défaut (anonyme, sans
  membership, ou erreur). **Affichage uniquement** : les droits réels sont dans RLS.
- Attribuer un rôle : SQL / service role (pas d'UI pour l'instant).

## Clients Supabase

- `src/lib/supabase/{client,server}.ts` ; `src/proxy.ts` rafraîchit la
  session (Next 16 : `proxy` remplace `middleware`) et ne fait rien tant que
  `.env.local` n'est pas renseigné (voir `.env.example`).

---

## Décisions d'architecture (2026-10-02)

1. **Packs : le dépôt Git est la source de vérité.**
   - Les packs vivent dans `packs/`, sont validés en CI (`scripts/validate-packs.ts`)
     et chargés par l'app au build.
   - Une proposition de contributeur est stockée en base (table `contributions`) ;
     quand un mainteneur l'approuve, elle devient une modification du pack dans
     Git (PR + incrément de version), jamais une édition directe en production.

2. **Voix : transcription côté serveur, derrière une abstraction.**
   - Navigateur : bouton *push-to-talk* → `MediaRecorder` → `POST /api/transcribe`.
   - Serveur : interface `SpeechToText` (`lib/speech/`), fournisseur
     interchangeable. Fournisseur par défaut à choisir à l'implémentation
     (critères : français, robustesse au bruit ventilateur/tambour, coût).
   - Pas la Web Speech API : support inégal (Firefox), qualité variable dans le bruit.
   - La saisie texte reste toujours disponible.

3. **Lecture anonyme autorisée.**
   - Consulter les packs et discuter avec l'assistant sans compte.
   - Compte requis pour contribuer, valider, et pour l'historique de conversation.
   - `/api/chat` et `/api/transcribe` **limités en débit** (par IP pour les
     anonymes, quota plus large pour les connectés).

---

## Conventions

- Langue de l'UI : français d'abord, i18n prévue.
- Les packs sont la source de vérité ; la base Supabase stocke les propositions,
  revues, rôles et historique de conversation — pas une copie divergente du savoir.
- Chaque réponse de l'assistant cite les entrées du pack utilisées (id de section).
- Pas de secret dans le dépôt ; `.env.local` uniquement, `.env.example` documenté.
