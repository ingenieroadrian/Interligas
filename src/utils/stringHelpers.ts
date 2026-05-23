import { supabase } from '../lib/supabase';

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]/g, '');      // keep only alphanumeric
}

export function generateLeagueEmail(leagueName: string): string {
  if (!leagueName.trim()) return '';
  return `${toSlug(leagueName)}@interligas.com`;
}

export function generateCoachEmail(coachName: string, leagueName: string): string {
  if (!coachName.trim() || !leagueName.trim()) return '';
  const firstLetter = toSlug(coachName.trim()).charAt(0);
  const leagueSlug = toSlug(leagueName);
  return `${firstLetter}.${leagueSlug}@interligas.com`;
}

export async function resolveUniqueEmail(baseEmail: string): Promise<string> {
  // Check system_users table for the email
  const [local, domain] = baseEmail.split('@');
  let candidate = baseEmail;
  let suffix = 2;

  while (true) {
    const { data } = await supabase
      .from('system_users')
      .select('id')
      .eq('email', candidate)
      .maybeSingle();

    if (!data) return candidate;
    candidate = `${local}${suffix}@${domain}`;
    suffix++;
  }
}
