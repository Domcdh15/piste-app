# Clos-ia — état du projet

Document de reprise, écrit pour être lu sur une machine neuve, sans historique
de conversation. Il dit **ce qui existe**, **pourquoi c'est ainsi**, et **ce qui
reste**. Les décisions y sont accompagnées de leur raison : c'est ce qui évite
de les refaire à l'envers.

Dernière mise à jour : 11 septembre 2026.

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

**Le build ne détecte pas tout — `npm run lint` si.** `npm run build` passe même
quand un composant JSX ou une fonction n'est pas défini : l'erreur n'apparaît
qu'à l'exécution, en écran blanc. Ça a mordu deux fois sur le pipeline. Depuis
le 11 septembre 2026, `npm run lint` attrape cette famille entière, composants
JSX compris. **Le lancer après toute modification**, le build ne suffit pas.

La configuration exige ESLint 10 : la version 9 ne vérifie pas les identifiants
JSX et laissait passer `<Truc />` non défini. Les règles bloquantes décrivent
des plantages — identifiant inconnu, hook appelé conditionnellement ; le style
et la performance avertissent sans bloquer, pour que la base reste à zéro
erreur et qu'un rouge signifie toujours quelque chose.

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

### Supprimer une fiche, c'est supprimer son historique
Dix tables filles partent avec la fiche (`CASCADE`) : activités, tâches,
documents, signatures, séquences, événements, et les trois artefacts d'IA —
emails générés, analyses, scripts d'appel. Deux survivent, détachées
(`SET NULL`) : les **tickets**, qui appartiennent au client et non à la fiche,
et les **interlocuteurs rattachés**, qui redeviennent des affaires à part
entière. C'est ce que promet l'écran de confirmation ; avant le 8 septembre
2026 les trois artefacts d'IA étaient en `NO ACTION` et la suppression échouait
en silence dès qu'une fiche avait servi à l'IA une seule fois.

Le quota d'IA n'est pas remboursé pour autant : il vit dans
`user_settings.ai_calls_used`, un compteur, et non dans le nombre de lignes.

### Le tourniquet de leads est éteint par défaut
`teams.lead_round_robin`. L'activer changerait sans prévenir à qui reviennent
les leads des équipes déjà en place. Le tour de rôle se déduit de
`team_members.last_lead_at` plutôt que d'un compteur : un absent ne prend pas
son tour, et la rotation reprend seule à son retour. **La date vient de
`clock_timestamp()` et non de `now()`** — `now()` est figé pour toute une
transaction, donc un import en lot partait entièrement chez la même personne.

### Un écran qui tombe n'emporte pas l'application
Une frontière d'erreur entoure le contenu de chaque page, avec une clé sur
l'onglet actif pour qu'elle se réinitialise au changement de page : un écran en
panne laisse la navigation debout et n'empêche pas d'aller ailleurs. Une
seconde, à la racine, couvre ce qui précède la navigation. L'écran propose de
recharger et de **réinitialiser l'affichage**, qui efface les préférences
mémorisées — c'est le geste qu'il fallait faire à la main dans la console pour
sortir de la panne du pipeline, la vue fautive étant enregistrée dans le
navigateur.

### Une entreprise se reconnaît à son domaine, pas à son orthographe
Le rattachement cherche d'abord le nom saisi ; s'il ne correspond à rien, il
cherche le domaine de l'adresse professionnelle. « We Assign », « WeAssign » et
« WeAssign SAS » ne font donc qu'une maison. Les boîtes personnelles sont
exclues, sans quoi tous les contacts en @gmail.com n'en feraient qu'une seule.

### Le mode absence ne répond qu'à des humains
Le courrier automatique est écarté sans condition — en-têtes `List-Id`,
`List-Unsubscribe`, `Precedence`, `Auto-Submitted`, et les boîtes `no-reply`.
Une réponse d'absence envoyée à une liste de diffusion repart parfois vers tous
ses abonnés, et envoyée à un spam elle confirme que l'adresse est lue. Ne
répondre qu'aux personnes du fichier reste une option, décochée par défaut.

### Une seule auteure, plusieurs identités
Un `.mailmap` dans chacun des trois dépôts ramène sous « Domitille Debouy » les
sept identités laissées par les machines et les comptes utilisés. L'historique
d'origine n'a pas été réécrit : il reste vérifiable, ce qui vaut mieux à
quelques semaines d'une cession de droits sur le logiciel.

### La dépense d'IA est bornée deux fois
Le quota par utilisateur, vérifié dans `api/generate.js` **avant** l'appel,
borne l'usage des clients : c'est la vraie protection. Le plafond mensuel de la
console Anthropic — 50 $, avec une alerte par courriel à 20 $, posés le
11 septembre 2026 — protège d'un défaut du code, pas des clients. Pour situer :
la consommation réelle au 11 septembre était de 0,07 $ sur la période.

### Les intégrations ne mentent pas sur leur état
Slack, Notion et Brevo/Mailjet fonctionnent (clé d'API collée par le client).
Zapier et Make marchent **par clé d'API** — l'application Clos-ia n'est pas
publiée dans leur annuaire, d'où la mention exacte « Par clé d'API ». Aircall et
Stripe n'ont rien derrière et le disent.

---

## 4. Bugs connus, non corrigés

**17 mentions « à compléter »** dans les pages légales (CGV, CGU, mentions
légales). Elles attendent des informations que seule la fondatrice a : forme
juridique définitive, capital, SIREN, adresse du siège, nom du médiateur,
hébergeur déclaré.

**Pas de sélecteur de TVA par ligne** dans le devis : le moteur le gère,
l'interface non.

**Pas de limite de débit par clé d'API** sur `api/zapier.js`.

---

## 5. Ce qui reste à faire

- **Vercel Pro et Supabase Pro** avant le premier paiement client. Ce sont les
  seuls coûts fixes : de l'ordre de 45 $ par mois, soit trois clients Solo pour
  les couvrir. C'est ce chiffre qui décide des six premiers mois, pas la marge
  sur Business.
- **Protection contre les mots de passe compromis** à activer dans Supabase :
  elle vérifie à l'inscription que le mot de passe choisi ne figure pas dans
  les fuites connues.
- **Recherche d'antériorité INPI**. `closia.fr` est pris depuis 2021 par un
  cabinet de transmission d'entreprise, et c'est encore ce que Google renvoie
  pour « Closia ». La marque a donc été renommée **Clos-ia**, alignée sur le
  domaine détenu — application, site et back-office ont basculé le 8 septembre
  2026. Reste à faire trancher par un juriste la seule question qui compte : le
  trait d'union suffit-il à écarter le risque de confusion ? Les deux noms se
  prononcent de la même façon, et les deux s'adressent aux dirigeants de PME.
  Le dépôt INPI ne se fait qu'après cette réponse.
- **Une seule intégration de facturation**, pas quatre. Pennylane d'abord, parce
  que c'est celle que les PME partagent avec leur expert-comptable. En attendant,
  un export du devis couvre les quatre cas sans rien construire.
- **Distribution automatique de leads** : le tourniquet existe, mais rien
  n'alimente encore les leads entrants en dehors du formulaire du site.
- **Une vraie analyse de pipeline en libre-service** : le bouton du site promet
  « Voir ce que Clos-ia ferait avec mon pipeline », et derrière il y a un
  rendez-vous. Honnête tant qu'on tient la promesse pendant l'appel, mais ça ne
  passe pas à l'échelle.

---

## 6. Comptes

| Compte | Rôle |
|---|---|
| `domitille.debouy@clos-ia.fr` | **compte professionnel.** `PRO_ACCOUNT_USER_ID` dans le back-office — c'est lui qui reçoit la fiche de suivi de chaque client créé, et c'est de sa boîte Gmail que part l'invitation. Toujours **sans équipe**, donc privé de tout ce qui est cloisonné par équipe : en créer une le débloquerait sans déplacer aucune donnée. |
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

- `npm run lint` avant de pousser, pas seulement `npm run build` : c'est le seul
  des deux qui voit un composant ou une fonction qui n'existe pas.
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
