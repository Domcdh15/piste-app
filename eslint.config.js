import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

// Le greffon React livre deux familles de règles. Celle qui compte décrit un
// vrai plantage : un hook appelé de façon conditionnelle fait diverger le
// nombre de hooks entre deux rendus, et React s'arrête net. Les autres sont
// des conseils de performance et de pureté — utiles à lire, mais du code qui
// tourne depuis des mois ne doit pas faire échouer le contrôle à cause d'elles.
// Sans cette distinction, le contrôle est rouge dès le premier jour, et un
// contrôle toujours rouge ne se lit plus.
const reglesHooks = Object.fromEntries(
  Object.keys(reactHooks.configs.recommended.rules).map((regle) => [regle, "warn"])
);
reglesHooks["react-hooks/rules-of-hooks"] = "error";

// Le contrôle que `npm run build` ne fait pas.
//
// Vite compile sans se plaindre d'un composant ou d'une fonction qui n'existe
// pas : l'erreur n'apparaît qu'à l'exécution, chez l'utilisateur, sous la
// forme d'un écran blanc. C'est arrivé deux fois sur le pipeline, et une
// troisième fois a été évitée de justesse — `useMemo` non importé, build au
// vert. La règle no-undef attrape cette famille entière, y compris les
// composants JSX : `<Truc />` non défini est signalé comme le reste.
//
// Deux environnements, parce que les globales n'y sont pas les mêmes :
// `window` et `localStorage` n'existent pas dans une fonction serveur,
// `process` et `Buffer` n'existent pas dans le navigateur. Un seul bloc
// commun laisserait passer un `window` oublié dans api/.
export default [
  { ignores: ["dist/**", "node_modules/**"] },

  // Le CRM, dans le navigateur.
  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...reglesHooks,
      "no-undef": "error",
      // Une variable inutilisée est du bruit, pas un danger : on la signale
      // sans bloquer. Les arguments non utilisés sont souvent imposés par une
      // signature, et les majuscules servent aux composants importés pour
      // leurs effets de bord.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]" }],
      // Un bloc catch vide est parfois délibéré — stockage refusé en navigation
      // privée, par exemple —, mais il doit porter un commentaire qui le dise.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Les espaces insécables sont voulus : la typographie française en exige
      // avant « € », « : » ou « ? », et les documents PDF en sont pleins.
      // Les espaces insécables sont voulus : la typographie française en exige,
      // et une expression régulière les traque pour normaliser les séparateurs
      // de milliers que produit Intl.NumberFormat en français.
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
      "no-useless-escape": "warn",
      // `{false && ...}` désactive délibérément un bloc d'interface : la règle
      // a raison sur la forme, mais l'intention est explicite.
      "no-constant-binary-expression": "warn",
    },
  },

  // Les fonctions serverless, dans Node.
  {
    files: ["api/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node, fetch: "readonly", Response: "readonly", Request: "readonly" },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
