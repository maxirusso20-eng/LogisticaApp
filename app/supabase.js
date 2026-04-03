import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://caewphtmlhatimnsfubl.supabase.co'
const supabaseAnonKey = 'sb_publishable_Mj-TG1nvq7D_Q-6PUOiOXA_LxeUuJIn'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)