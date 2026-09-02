# Closia — état du projet

Document de reprise, écrit pour être lu sur une machine neuve, sans historique
de conversation. Il dit **ce qui existe**, **pourquoi c'est ainsi**, et **ce qui
reste**. Les décisions y sont accompagnées de leur raison : c'est ce qui évite
de les refaire à l'envers.

Dernière mise à jour : 3 septembre 2026.

---

## 1. Les trois dépôts

| Dépôt | Rôle | Adresse en ligne |
|---|---|---|
| `piste-app` | Le CRM (React 18 + Vite, pas de router : la navigation se fait par `activeTab` dans `Shell.jsx`) | `app.clos-ia.fr` |
| `closia-site` | Le site vitrine (HTML/CSS/JS statiques) | `www.clos-ia.fr` |
| `closia-admin` | Le back-office (HTML/CSS/JS statiques) | `closia-admin.vercel.app` |

Base de données : Supabase, projet `rbzbvbfgselsyrkxvwbj`, région `eu-north-1`
(Stockholm). **Les données ne sont pas hébergées en France** — le site doit dire
« Union européenne », jamais « France ».

Sur une machine neuve :

```bash
cd ~/Downloads
git clone https://github.com/Domcdh15/piste-app.git
git clone https://github.com/Domcdh15/closia-site.git
git clone https://github.com/Domcdh15/closia-admin.git
cd piste-app && npm install
```

Aucun secret n'est stocké localement : les clés vivent dans Vercel et Supabase.

---

## 2. Contraintes à ne pas oublier

**Le plafond de 12 fonctions serverless Vercel.** On est à **10 / 12**. Chaque
nouvel endpoint consomme une place. C'est pour ça que `api/zapier.js` route par
un paramètre `resource` au lieu d'avoir un fichier par ressource, et que la
déconnexion du calendrier vit dans `api/calendar/status.js`.

Les dix : `admin/overview`, `admin/update-user`, `calendar/range`,
`calendar/status`, `generate`, `google/callback`, `integrations`, `sign`,
`team`, `zapier`.

**Le build ne détecte pas tout.** `npm run build` passe même quand un composant
JSX ou une fonction n'est pas défini. Après toute modification, vérifier à part
que chaque `<Composant>` utilisé est bien importé ou déclaré. Ça a mordu
plusieurs fois.

**Les styles en ligne ne portent pas de media query.** Le CRM utilise des styles
inline ; le responsive passe par les classes CSS globales.

---

## 3. Décisions structurantes, et leur raison

### Une seule grille tarifaire
`api/_lib/plans.js` fait foi. **Trois copies périmées ont déjà été trouvées et
supprimées** : dans le back-office (un client à 69 € s'y affichait « Business »,
et sa facture aussi), dans l'écran Abonnement du CRM, et sur le site. Ne jamais
recopier la grille : l'importer.

Grille au 3 septembre 2026 : Solo 19 € (1 siège, 300 générations IA), Équipe
69 € (5 sièges, 500), Business 129 € (10 sièges, 600, +15 €/siège au-delà).

**Solo et Équipe sont plafonnées** (`overagePrice: null`) : au-delà de leur
nombre de sièges, `api/team.js` refuse l'invitation et renvoie vers la formule
supérieure. Sans ce plafond, Équipe avec des sièges en plus resterait moins
chère que Business jusqu'à dix personnes, et la promesse « Business, jusqu'à 10
utilisateurs » ne voudrait plus rien dire.

### Les tarifs sont masqués sur le site
Décision du 3 septembre 2026 : **la SASU n'est pas immatriculée et Stripe n'est
pas en place**. Afficher un prix engagerait sur une vente impossible à
encaisser, au nom d'une société qui n'existe pas encore. Le site montre les
trois formules et leurs promesses, sans montant. `subscribe.html` est neutralisée
(elle recueillait des coordonnées de facturation et promettait une facture sous
24 h). À rouvrir le jour de l'immatriculation.

### Encadrer n'est pas un métier
`team_members.role` dit ce qu'une personne **fait** (admin, sales,
customer_success). `team_members.manages` dit ce qu'elle **encadre** (none,
sales, csm, both). Les deux sont indépendants : un directeur commercial vend et
encadre. Les règles d'accès continuent de s'appuyer sur `role` ; `manages`
s'ajoute par-dessus via `my_team_manages()` et `encadre_ce_pool()`.

### La santé d'un client n'est pas stockée
Elle est recalculée à l'affichage, et rendue **avec ses raisons**. Un score figé
en base vieillit sans que personne sache de quand il date, et un nombre seul ne
se discute pas en entretien.

### L'IA ne se déclenche jamais seule
Sur les tickets comme sur le bilan hebdomadaire, c'est l'utilisateur qui appuie,
et chaque génération est décomptée de **son** quota. Un CRM qui écrit tout seul
à vos clients est un risque, pas une fonctionnalité.

### Le tourniquet de leads est éteint par défaut
`teams.lead_round_robin`. L'activer changerait sans prévenir à qui reviennent
les leads des équipes déjà en place. Le tour de rôle se déduit de
`team_members.last_lead_at` plutôt que d'un compteur : un absent ne prend pas
son tour, et la rotation reprend seule à son retour. **La date vient de
`clock_timestamp()` et non de `now()`** — `now()` est figé pour toute une
transaction, donc un import en lot partait entièrement chez la même personne.

### Les intégrations ne mentent pas sur leur état
Slack, Notion et Brevo/Mailjet fonctionnent (clé d'API collée par le client).
Zapier et Make marchent **par clé d'API** — l'application Closia n'est pas
publiée dans leur annuaire, d'où la mention exacte « Par clé d'API ». Aircall et
Stripe n'ont rien derrière et le disent.

---

## 4. Bugs connus, non corrigés

**Suppression silencieuse d'un prospect.** `prospects` est référencée par
`emails_generes`, `analyses_ia` et `scripts_appel` en `NO ACTION`. Supprimer un
prospect qui a un email généré échoue, et `handleDeleteProspect` ignore
l'erreur : l'utilisateur croit que c'est fait. À corriger en supprimant les
lignes liées d'abord, ou en passant les clés étrangères en `CASCADE`.

**17 mentions « à compléter »** dans les pages légales (CGV, CGU, mentions
légales). Elles attendent des informations que seule la fondatrice a : forme
juridique définitive, capital, SIREN, adresse du siège, nom du médiateur,
hébergeur déclaré.

**Pas de sélecteur de TVA par ligne** dans le devis : le moteur le gère,
l'interface non.

**Pas de limite de débit par clé d'API** sur `api/zapier.js`.

---

## 5. Ce qui reste à faire

- **Vercel Pro et Supabase Pro** avant le premier paiement client.
- **Plafond de dépense Anthropic** à poser dans la console (à faire par la fondatrice).
- **Recherche d'antériorité INPI** : `closia.fr` est pris depuis 2021 par un
  cabinet de transmission d'entreprise, et c'est ce que Google renvoie pour
  « Closia ». Viser « Closia CRM ».
- **Une seule intégration de facturation**, pas quatre. Pennylane d'abord, parce
  que c'est celle que les PME partagent avec leur expert-comptable. En attendant,
  un export du devis couvre les quatre cas sans rien construire.
- **Distribution automatique de leads** : le tourniquet existe, mais rien
  n'alimente encore les leads entrants en dehors du formulaire du site.
- **Une vraie analyse de pipeline en libre-service** : le bouton du site promet
  « Voir ce que Closia ferait avec mon pipeline », et derrière il y a un
  rendez-vous. Honnête tant qu'on tient la promesse pendant l'appel, mais ça ne
  passe pas à l'échelle.

---

## 6. Comptes

| Compte | Rôle |
|---|---|
| `domitille.debouy@clos-ia.fr` | perso — **sans équipe**, donc privé de tout ce qui est cloisonné par équipe |
| `domitille.croizier@gmail.com` | démo Solo |
| `augustin.debouy@we-assign.com` | client réel — **ne pas y toucher** |
| `test.solo@` / `test.equipe@` / `test.business@clos-ia.fr` | démonstration, remplis de données crédibles |

Les comptes de test portent 8 coéquipiers fictifs (`demo.marc@`, `demo.sophie@`,
`demo.nadia@`, `demo.julien@`, `demo.claire@`, `demo.vincent@`, `demo.laure@`,
`demo.karim@`). **Ils n'ont pas de mot de passe** : pour montrer la vue d'un
commercial, passer par « Accéder au compte » dans le back-office.

Les adresses des faux clients sont en `.example`, domaine réservé par la RFC 2606
qui ne résout jamais : une démonstration où l'on clique « envoyer » n'écrit à
personne.

---

## 7. Manière de travailler

- Toute migration est **miroitée** dans `supabase/*.sql`, avec le commentaire qui
  dit pourquoi.
- Rien de destructif sans vérification préalable : `_` est un joker dans `LIKE`,
  et un `delete ... like '__t%'` a déjà visé de vraies fiches (la transaction a
  été annulée à temps).
- Les clés d'API, jetons et mots de passe ne sont **jamais** saisis par
  l'assistant, même avec autorisation explicite. C'est au client de les coller.
- Les comptes d'authentification ne se créent que par le back-office ou
  l'invitation depuis le CRM — jamais par écriture directe dans `auth.users`,
  qui contourne le hachage du mot de passe et produit des comptes incapables de
  se connecter.
