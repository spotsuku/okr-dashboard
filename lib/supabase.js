import { createClient } from '@supabase/supabase-js'

// ビルド時に env vars が無い (or Sensitive で読めない) ケースに備えて
// placeholder 値を用意しておく。実行時に正しい値が入っていれば正常動作、
// 無ければ最初のクエリで失敗 (build は通る)。
const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
