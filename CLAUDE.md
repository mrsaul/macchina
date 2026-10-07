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

## Flux de contribution

- **Base de connaissances** = sections du pack (Git, « base verrouillée », non
  éditables dans l'app) + contributions `approved` (Supabase). Une seule fonction
  `buildKnowledge()` (`src/lib/knowledge.ts`) sert au Journal et aux prompts
  (`getKnowledge()` côté serveur) : une contribution validée sert aussitôt aux réponses.
- **Contributeur / mainteneur** : chaque message passe d'abord par `classify`.
  `info` → carte « Proposition » (`ProposalCard`) à confirmer ; à la confirmation,
  insertion directe en `proposed` depuis le client (RLS vérifie le rôle).
  `question` → réponse normale. `command` → message « pas encore pris en charge ».
- **Journal** (`JournalDialog`, onglets selon le rôle) : Base (groupée par section,
  provenance proposé par / validé par), À valider (mainteneurs : éditer le texte,
  Valider, Rejeter avec motif obligatoire), Mes propositions (statut + motif),
  Versions (historique du pack).
- Validation d'une entrée `safety` : case « vérifié avec une source fiable »
  obligatoire dans l'UI.
- **Provenance** : table `profiles` (`display_name` public, défaut anonyme
  « Contributeur XXXX » dérivé de l'id ; jamais l'e-mail). Créée par trigger à
  l'inscription ; chacun ne peut modifier que son propre nom.
- **Temps réel** : `contributions` est dans la publication `supabase_realtime` ;
  `useContributions()` recharge sur chaque événement (RLS appliquée par abonné).

## Provenance et noms d'utilisateur

- **Nom d'utilisateur obligatoire** (`profiles.username`, unique sans casse, 2–30
  caractères) avant de contribuer ou de créer une machine — imposé par des triggers
  (`require_username`), quel que soit le chemin. `display_name` suit le username.
  Première connexion sans username → `/compte`. En-tête : « Choisir un nom ».
- **Source structurée** sur `contributions` : `source_type` (`contributor` |
  `manual` | `document`), `source_label` (affiché : « Saul », « Aude »,
  « Manuel du moulin »), `source_ref` (id du compte, ou du document, ou null).
  Trigger `contributions_fill_source` : sans libellé → le proposant (son nom) ;
  autre personne → libellé tel quel, pas de lien vers un compte ; manuel/document
  → libellé obligatoire. Renommer son compte met à jour ses propres sources.
- À la proposition : « Moi / Une autre personne / Un manuel / Un document ».
  Le mainteneur peut corriger la source avant de valider. Journal : « Source : … ».
- **Réponses sourcées** : chaque entrée du journal reçoit un id court `[eN]` +
  sa source dans le prompt ; le modèle termine par `SOURCES: e1, e4` (retiré du
  flux par `createAnswerParser`). Le serveur ne garde que les ids existants, n'en
  envoie aucun si la réponse est refusée ou tronquée, et transmet les libellés
  distincts (événement `sources`). L'UI affiche « Sources : » sous la réponse
  (personne = contour, manuel/document = bloc noir). **Jamais de source non
  déclarée par le modèle.**

## Machines et ontologie commune

- **Ontologie** (`src/lib/ontology.ts`) : types `roaster | grinder | espresso | other`
  et identifiants d'intentions **communs** (`securite`, `utilisation`, `reglages`,
  `entretien`, `depannage`). Tous les packs ont la même forme ; seuls changent selon
  le type : `controls` (commandes), `outline` (sections prévues), `vocabulary`,
  mots-clés et suggestions. (Le pack S7X garde ses intentions historiques, dont
  `torrefaction`.)
- **Ajouter une machine** : `/machines/new` → `POST /api/machines` (connecté) →
  le modèle propose la **structure** (`src/lib/ai/generate-pack.ts`, effort medium,
  ~30 s) → `assembleStarterPack()` retire toute description contenant un chiffre,
  borne les tailles, force une section `securite`, `limits` vide → RPC
  `create_machine()` (security definer) insère la machine **et** le membership
  `maintainer` du créateur, génère l'id (slug + suffixe), force l'id du pack,
  max 5 machines/jour/compte → redirection `/m/[machineId]`.
- **Aucune valeur inventée** dans un pack généré : réglages, températures, seuils
  viennent uniquement des contributions validées.
- Pages par machine : `/m/[machineId]` (chat) et `/m/[machineId]/narration`
  (torréfacteurs uniquement). `/` = machine par défaut ; `/narration` redirige.
- Journal › Base affiche aussi les sections prévues encore vides, les commandes et
  le vocabulaire.

## Narration live (`/narration`)

- Le torréfacteur saisit ou colle (Roastware) : temps, phase, Bean Surface,
  Internal, RoR, DTR. Toutes les 20 s, **si les valeurs ont changé**, le relevé
  et les 10 précédents partent vers `/api/copilot` mode `narrate`.
- **Conseil uniquement** : l'app ne parle jamais à la machine ; le prompt
  interdit de prétendre agir.
- **Exception assumée à « pack uniquement »** : pour interpréter une courbe, le
  modèle peut utiliser les principes généraux de torréfaction. Commandes propres
  à la machine et **toute valeur chiffrée** : uniquement depuis le pack.
- **Sécurité** : réponse `{ comment, safety: { level: none|attention|danger, message } }`.
  Les seuils durs sont dans `pack.limits` (source obligatoire) et vérifiés **par le
  serveur** (`checkLimits`) : un dépassement force `danger`, même si le modèle
  échoue ou dit le contraire. Le modèle n'invente jamais de seuil.
- Temps = chrono ancré sur la dernière saisie (sinon des relevés successifs
  partagent le même temps et la tendance est faussée).
- Réservé aux comptes connectés (≈30 appels / 10 min) ; limite 45 / 10 min ;
  un 401 ou 429 met la boucle en pause. Effort `low` (latence mesurée : 5–9 s).
- Parser Roastware (`parsePastedReadings`) : heuristique sur des libellés, à
  ajuster quand on aura un vrai extrait de Roastware.

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
  - `mode: "narrate"` (comptes connectés) : voir « Narration live ».
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

## Déploiement

- **Production : https://maccina.vercel.app** — projet Vercel `maccina`, équipe
  « filteer's projects » (`filteers-projects`). Lien local dans `.vercel/` (ignoré par Git).
- Déploiement manuel tant que GitHub n'est pas relié au projet : `vercel deploy --prod`.
- Variables Vercel : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (production, preview, development). `ANTHROPIC_API_KEY` à ajouter (sensible).
- Supabase Auth : `site_url` = production ; URLs de retour = production + `localhost:3100`.
  Pour un nouveau domaine : `config.toml` puis `supabase config push` (lire le diff).

---

## Décisions d'architecture (2026-10-02)

1. **Packs : deux sources, un schéma** (révisé le 2026-10-08 avec « Ajouter une machine »).
   - Machines **curées** (S7X) : pack versionné dans Git, prioritaire pour son id.
   - Machines **créées dans l'app** : pack de départ généré, stocké dans `machines.pack`.
   - `getPack(id)` (async, `src/lib/packs/index.ts`) : Git d'abord, puis la base.
   Ancienne règle pour les packs Git :
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
