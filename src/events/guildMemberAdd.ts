import { Events, GuildMember } from 'discord.js';
import { getMemberByDiscordId } from '../services/member';

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  console.log(`[guildMemberAdd] ${member.user.tag} (${member.user.id})`);

  const memberInfo = await getMemberByDiscordId(member.user.id);
  if (!memberInfo) {
    console.log(`  -> Not found in Supabase, skipping.`);
    return;
  }

  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID!;

  await Promise.all([
    member.setNickname(memberInfo.nickname).catch((err: Error) =>
      console.error(`  -> setNickname failed:`, err.message)
    ),
    member.roles.add(memberRoleId).catch((err: Error) =>
      console.error(`  -> roles.add failed:`, err.message)
    ),
  ]);

  console.log(`  -> Set nickname "${memberInfo.nickname}" and added member role.`);
}
