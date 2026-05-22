import { Events, GuildMember } from 'discord.js';
import { getMemberByDiscordId } from '../services/member';

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  console.log(`[guildMemberAdd] ${member.user.tag} (${member.user.id})`);

  const registeringRoleId = process.env.DISCORD_REGISTERING_ROLE_ID!;
  const tasks: Promise<unknown>[] = [
    member.roles.add(registeringRoleId).catch((err: Error) =>
      console.error(`  -> roles.add failed:`, err.message)
    ),
  ];

  const memberInfo = await getMemberByDiscordId(member.user.id);
  if (memberInfo) {
    tasks.push(
      member.setNickname(memberInfo.nickname).catch((err: Error) =>
        console.error(`  -> setNickname failed:`, err.message)
      )
    );
  }

  await Promise.all(tasks);
  console.log(`  -> Added registering role${memberInfo ? `, set nickname "${memberInfo.nickname}"` : ''}.`);
}
