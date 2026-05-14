import { supabase } from '../clients/supabase';

export type MemberInfo = {
  name: string;
  class_name: string | null;
  nickname: string;
};

type RawMember = { name: string; class_name: string | null };
type RawDiscordMember = RawMember & { discord_id: string };

function buildNickname(name: string, class_name: string | null): string {
  return class_name ? `${class_name} ${name}` : name;
}

export async function getMemberByDiscordId(discordId: string): Promise<MemberInfo | null> {
  const { data, error } = await supabase.rpc('get_user_by_discord_id', {
    discord_user_id: discordId,
  });

  if (error) {
    console.error('getMemberByDiscordId error:', error.message);
    return null;
  }
  if (!data || (data as RawMember[]).length === 0) return null;

  const user = (data as RawMember[])[0];
  return {
    name: user.name,
    class_name: user.class_name,
    nickname: buildNickname(user.name, user.class_name),
  };
}

export async function getAllDiscordMembers(): Promise<Map<string, MemberInfo>> {
  const { data, error } = await supabase.rpc('get_all_discord_members');

  if (error) {
    console.error('getAllDiscordMembers error:', error.message);
    return new Map();
  }
  if (!data) return new Map();

  const map = new Map<string, MemberInfo>();
  for (const row of data as RawDiscordMember[]) {
    map.set(row.discord_id, {
      name: row.name,
      class_name: row.class_name,
      nickname: buildNickname(row.name, row.class_name),
    });
  }
  return map;
}
