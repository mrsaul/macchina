# Roast Copilot

Assistant open source pour comprendre et piloter des torréfacteurs à café, en
commençant par la **Stronghold S7X**. On pose une question (à l'écrit ou à la
voix) ; l'assistant répond uniquement à partir de la base de connaissances de la
machine, et dit quand l'information manque.

- **Lecture ouverte** : sans compte, on consulte la base et on interroge l'assistant.
- **Écriture par rôles**, par machine : `reader` (lecture), `contributor` (propose
  des connaissances), `maintainer` (valide ou rejette). Les droits sont appliqués
  dans la base (Row Level Security), pas seulement dans l'interface.
- **Connaissance séparée de l'app** : chaque machine a un *pack* JSON versionné
  dans `packs/`, complété par les contributions validées.
- **Sécurité** : tout contenu touchant chaleur, feu ou limites machine est marqué
  `safety` et doit être vérifié avant validation.

Stack : Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Auth,
Postgres, RLS, Realtime) · API Anthropic côté serveur · Vercel.

---

## Prérequis

- **Node.js 20.9 ou plus récent** et npm
- **Supabase CLI** — [installation](https://supabase.com/docs/guides/cli/getting-started)
- Un projet **Supabase** (gratuit) et une clé **API Anthropic** ([console.anthropic.com](https://console.anthropic.com))
- Pour le déploiement : un compte **Vercel** et le Vercel CLI (`npm i -g vercel`)

> macOS : évitez de placer le projet dans un dossier synchronisé par iCloud
> (`~/Documents`, `~/Desktop`) — `next dev` et `next build` peuvent s'y bloquer.

## 1. Cloner et installer

```bash
git clone https://github.com/mrsaul/macchina.git roast-copilot
cd roast-copilot
npm install
```

## 2. Configurer l'environnement

```bash
cp .env.example .env.local
```

Renseignez dans `.env.local` :

| Variable | Où la trouver | Exposée au navigateur |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | oui (publique) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (`sb_publishable_…`) | oui (publique) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | **non, serveur uniquement** |

`.env.local` est ignoré par Git. N'y mettez jamais la clé `service_role` / secret
de Supabase : l'application n'en a pas besoin.

## 3. Préparer la base Supabase

Connectez le CLI à votre compte et à votre projet :

```bash
supabase login
supabase link --project-ref <project-ref>
```

Appliquez les migrations (tables, RLS, profils, Realtime) et le seed (le pack de
la S7X dans la table `machines`) :

```bash
supabase db push --include-seed
```

**Authentification.** Dans `supabase/config.toml`, section `[auth]`, adaptez
`site_url` et `additional_redirect_urls` à vos adresses (production et
`http://localhost:3100/**`), puis :

```bash
supabase config push
```

Lisez le diff affiché avant de confirmer : il remplace la configuration Auth du
projet distant.

**Premier mainteneur.** Connectez-vous une fois dans l'application (lien magique
par e-mail), puis, dans Supabase → SQL Editor :

```sql
insert into public.memberships (user_id, machine_id, role)
select id, 'stronghold-s7x', 'maintainer' from auth.users where email = 'vous@exemple.fr'
on conflict (user_id, machine_id) do update set role = excluded.role;
```

Les rôles s'attribuent ainsi en SQL pour l'instant (`reader`, `contributor`,
`maintainer`).

> Le service d'e-mail par défaut de Supabase n'envoie qu'aux membres de l'équipe
> du projet, avec un débit limité. Pour ouvrir l'app à d'autres personnes,
> configurez un SMTP (Supabase → Authentication → SMTP).

## 4. Démarrer

```bash
npm run dev -- --port 3100
```

Ouvrez http://localhost:3100. Le port 3100 correspond aux adresses de retour
configurées pour l'authentification.

## Vérifier

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript
npm run test:db       # tests RLS : migrations rejouées dans PGlite, sans Docker
npm run build         # build de production
```

`npm run test:db` vérifie chaque règle d'accès pour chaque rôle (visiteur,
lecteur, contributeur, mainteneur). Toute modification de policy doit le passer.

## Déployer sur Vercel

```bash
vercel link
```

Ajoutez les variables d'environnement (Vercel → projet → Settings →
Environment Variables, ou `vercel env add`) :

| Variable | Environnements | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | standard |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview, Development | standard |
| `ANTHROPIC_API_KEY` | Production, Preview | **Sensitive** |

Puis déployez :

```bash
vercel deploy --prod
```

Ou reliez le dépôt GitHub au projet (Settings → Git) pour déployer à chaque push.
Pensez à ajouter l'URL de production dans `supabase/config.toml` puis à relancer
`supabase config push`.

Une variable ajoutée ou modifiée ne s'applique qu'au **déploiement suivant**.

## Commandes utiles

| Commande | Rôle |
|---|---|
| `npm run db:seed` | régénère `supabase/seed.sql` depuis `packs/*.json` |
| `npm run db:types` | régénère les types TypeScript de la base (projet lié) |
| `npm run test:db` | tests des règles d'accès (RLS) |

## Organisation du code

```
packs/                     packs machine (JSON versionné, source de vérité)
supabase/
  migrations/              schéma, RLS, profils, Realtime
  tests/rls.test.mjs       tests des règles d'accès
  seed.sql                 généré depuis packs/
src/
  app/                     pages (chat, connexion, /design) et route /api/copilot
  components/              chat, journal, composants d'interface VIBE
  hooks/                   useRole, useContributions, useSpeechRecognition
  lib/ai/                  interface LLMProvider + implémentation Anthropic
  lib/packs/               schéma et chargement des packs
  lib/supabase/            clients navigateur / serveur, types générés
```

Les conventions et décisions d'architecture sont détaillées dans `CLAUDE.md`.

## Ajouter une machine

1. Créez `packs/<id>.json` (schéma : `src/lib/packs/schema.ts`).
2. Enregistrez-le dans `src/lib/packs/index.ts`.
3. `npm run db:seed`, puis `supabase db push --include-seed`.

N'écrivez dans un pack aucune valeur technique (température, limite, procédure)
sans source vérifiable.

## Licence

À définir.
