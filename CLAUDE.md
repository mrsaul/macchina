@AGENTS.md

# Roast Copilot

Assistant open source pour comprendre et piloter des torréfacteurs à café.
Première machine supportée : **Stronghold S7X**.

L'utilisateur parle (voix) ou écrit ; l'assistant répond en s'appuyant sur la
base de connaissances propre à la machine sélectionnée — un **machine pack** JSON.

> État : design system VIBE, Supabase (schéma + RLS + auth lien magique), écran de
> chat et assistant IA (Claude, streaming, réponses fondées sur le pack) en place.

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

## Packs machine

- Format : `src/lib/packs/schema.ts` (Zod). Champs : identité, `version` (semver),
  `status` (`draft`/`published`), `sections`, `intents` (catégories + mots-clés,
  `safety` possible), `suggestions` (questions d'exemple liées à une intention),
  `journal` (historique daté des versions du pack, affiché via le bouton Journal).
- Nouveau pack : `packs/<id>.json` + l'enregistrer dans `src/lib/packs/index.ts`
  (`getPack`, serveur uniquement) + `npm run db:seed`.
- **Ne jamais inventer de contenu technique** (températures, limites, procédures) :
  seules des questions et des catégories sans fait machine peuvent être écrites
  sans source. Tout contenu technique vient d'une source citée et validée.
- Intentions : `classifyIntents()` par mots-clés (accents/majuscules ignorés),
  les intentions `safety` en premier. Provisoire, en attendant l'IA.

## Écran de chat

- `/` = chat de la machine par défaut (`DEFAULT_MACHINE_ID`) ; démo des composants
  sur `/design`.
- `src/components/chat/` : `ChatScreen` (état), `MachineHeader` (tag modèle,
  sous-titre, rôle via `useRole`, bouton Journal), `MessageList` (VOUS / modèle,
  tags d'intention, bandeau sécurité), `Composer` (micro, champ, Envoyer),
  `JournalDialog` (`<dialog>` natif, Échap pour fermer).
- Les suggestions **remplissent** le champ (pas d'envoi direct), comme la dictée.
- Seule une tranche sérialisable du pack (`ChatPack`) part au client.

## Assistant IA

- Contrat neutre : `src/lib/ai/provider.ts` — `LLMProvider` avec `generate()`
  (texte en streaming) et `generateJSON()` (objet conforme à un schéma Zod).
  Implémentation : `providers/anthropic.ts` (SDK officiel, `claude-opus-5-5`,
  `fallbacks: "default"` en cas de refus). Choix via `AI_PROVIDER` ; modèle
  surchargeable via `ANTHROPIC_MODEL`. **Aucun autre fichier n'importe un SDK
  fournisseur.** `getLLMProvider()` dans `src/lib/ai/index.ts`.
- JSON strict : `providers/anthropic-schema.ts` convertit le schéma Zod pour les
  *structured outputs* (le helper zod du SDK 0.131 transforme les `enum` en
  description : ne pas l'utiliser) ; la réponse est revalidée par Zod.
- **`POST /api/copilot`** (seule porte vers le modèle, clé uniquement serveur) :
  - `mode: "answer"` (tous, anonymes compris) : `{ machineId, turns }` → flux
    NDJSON (`AnswerStreamEvent`, `src/app/api/copilot/events.ts`). Réponse **en
    français**, uniquement depuis le pack (prompt : `src/lib/ai/prompt.ts`),
    sections citées `[§id]`, dit quand l'info manque. 1re ligne `INTENTIONS: …`
    retirée du flux par `intent-line.ts` ; une intention `safety` trouvée par
    mots-clés est toujours conservée.
  - `mode: "classify"` (contributor / maintainer de la machine, sinon 401/403) :
    `{ machineId, message }` → `{ kind: "info"|"question"|"command", entries }`,
    1 à 4 entrées `{ text, section, safety }` pour `info`, liste vide sinon
    (`src/lib/ai/classify.ts`). Le message est traité comme une donnée (balisé).
    `finalizeClassification()` impose les règles : slugs propres, 4 max, et
    `safety` forcé à `true` si les mots-clés sécurité du pack correspondent.
  - Rôle vérifié côté serveur par `getMachineRole()` (`src/lib/auth/`).
  - Limites : answer 10 / 10 min par IP (anonyme), 60 par compte ; classify 30
    par compte. **Limiteur en mémoire : par instance sur Vercel**, à remplacer
    par un stockage partagé avant la production.
- Client : `useChat` (historique = paires question/réponse terminées uniquement ;
  refus → texte partiel effacé ; annulation à la sortie de page).
- Clé : `ANTHROPIC_API_KEY` dans `.env.local` (et dans Vercel), jamais côté client.

## Clients Supabase

- `src/lib/supabase/{client,server}.ts` ; `src/proxy.ts` rafraîchit la
  session (Next 16 : `proxy` remplace `middleware`) et ne fait rien tant que
  `.env.local` n'est pas renseigné (voir `.env.example`).

---

## Décisions d'architecture (2026-10-02)

1. **Packs : le dépôt Git est la source de vérité.**
   - Les packs vivent dans `packs/`, sont chargés par l'app au build et validés
     par `MachinePackSchema` (Zod) au premier chargement.
   - Une proposition de contributeur est stockée en base (table `contributions`) ;
     quand un mainteneur l'approuve, elle devient une modification du pack dans
     Git (PR + incrément de version), jamais une édition directe en production.

2. **Voix : Web Speech API dans le navigateur pour le MVP** (révisé le 2026-10-03,
   à la demande du porteur du projet ; l'ancienne décision prévoyait une
   transcription serveur).
   - `useSpeechRecognition` (`src/hooks/`), en `fr-FR` : la dictée **remplit le
     champ sans jamais envoyer** ; étiquette « DICTÉ » + cadre épais jusqu'à l'envoi.
   - Limites connues : absente de Firefox (bouton micro désactivé) ; Chrome envoie
     l'audio aux serveurs de Google ; qualité variable dans le bruit de la machine.
   - Toute l'UI passe par ce hook : pour passer à une transcription serveur
     (`SpeechToText` + `POST /api/transcribe`), ne remplacer que le hook.
   - La saisie texte reste toujours disponible.

3. **Lecture anonyme autorisée.**
   - Consulter les packs et discuter avec l'assistant sans compte.
   - Compte requis pour contribuer, valider, et pour l'historique de conversation.
   - `/api/chat` (et `/api/transcribe` le cas échéant) **limités en débit** (par IP pour les
     anonymes, quota plus large pour les connectés) — voir « Assistant IA ».

---

## Conventions

- Langue de l'UI : français d'abord, i18n prévue.
- Les packs sont la source de vérité ; la base Supabase stocke les propositions,
  revues, rôles et historique de conversation — pas une copie divergente du savoir.
- Chaque réponse de l'assistant cite les entrées du pack utilisées (id de section).
- Pas de secret dans le dépôt ; `.env.local` uniquement, `.env.example` documenté.
