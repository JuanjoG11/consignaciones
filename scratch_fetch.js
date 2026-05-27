import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env manually
const envPath = './.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    env[key] = val;
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'] || 'https://zlhbvmlylzxeovtkedws.supabase.co';
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('consignaciones')
    .select('created_at, estado');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Total records in DB: ${data.length}`);
  
  const dates = data.map(c => c.created_at.split('T')[0]);
  const dateCounts = {};
  dates.forEach(d => {
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });

  console.log("Counts per date:");
  Object.keys(dateCounts).sort().forEach(d => {
    console.log(`  ${d}: ${dateCounts[d]} records`);
  });
}

run();
