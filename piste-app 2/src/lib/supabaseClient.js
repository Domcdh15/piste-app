import { createClient } from "@supabase/supabase-js";

// Ces informations sont publiques par conception (clé "anon"/"publishable").
// La sécurité réelle des données est assurée par les règles RLS
// configurées directement dans Supabase (table par table).
const supabaseUrl = "https://rbzbvbfgselsyrkxvwbj.supabase.co";
const supabaseAnonKey = "sb_publishable_IqBG4JndPA3wgsji3ovftg_5VQ2ULIa";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
