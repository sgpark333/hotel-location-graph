import { createClient } from '@supabase/supabase-js'

const supabaseUrl = typeof import.meta.env.VITE_SUPABASE_URL === 'string'
  ? import.meta.env.VITE_SUPABASE_URL.trim()
  : ''
const supabaseAnonKey = typeof (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) === 'string'
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).trim()
  : ''

export const supabaseEnvStatus = {
  hasUrl: Boolean(supabaseUrl),
  hasAnonKey: Boolean(supabaseAnonKey),
  urlPreview: supabaseUrl ? new URL(supabaseUrl).origin : null,
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
