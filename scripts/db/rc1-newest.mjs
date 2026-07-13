import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data } = await db.from('profiles').select('id,created_at').order('created_at', { ascending: false }).limit(1);
console.log(data?.[0]?.id?.slice(0, 8) ?? '');
