import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://mynjxxjnciejobotlhqr.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y-xZVNSecJ37puG2kHz-Kg_-ngjd6g4'

const envSupabaseUrl = typeof import.meta.env.VITE_SUPABASE_URL === 'string'
  ? import.meta.env.VITE_SUPABASE_URL.trim()
  : ''
const envSupabaseKey = typeof (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) === 'string'
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).trim()
  : ''

const supabaseUrl = envSupabaseUrl || DEFAULT_SUPABASE_URL
const supabaseAnonKey = envSupabaseKey || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export const supabaseEnvStatus = {
  hasUrl: Boolean(envSupabaseUrl),
  hasAnonKey: Boolean(envSupabaseKey),
  usingFallbackUrl: !envSupabaseUrl && Boolean(DEFAULT_SUPABASE_URL),
  usingFallbackKey: !envSupabaseKey && Boolean(DEFAULT_SUPABASE_PUBLISHABLE_KEY),
  urlPreview: supabaseUrl ? new URL(supabaseUrl).origin : null,
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
