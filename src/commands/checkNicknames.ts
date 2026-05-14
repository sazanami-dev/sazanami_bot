import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getAllDiscordMembers } from '../services/member';

export const data = new SlashCommandBuilder()
  .setName('check-nicknames')
  .setDescription('メンバーのニックネームをSupabaseと照合し、不一致を自動修正します')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild!;
  const memberRoleId = process.env.DISCORD_MEMBER_ROLE_ID!;

  const [discordMembers, supabaseMembers] = await Promise.all([
    guild.members.fetch(),
    getAllDiscordMembers(),
  ]);

  const fixed: string[] = [];
  const notInDB: string[] = [];
  const failed: string[] = [];

  for (const [, member] of discordMembers) {
    if (member.user.bot) continue;
    if (member.user.id === process.env.SAZANAMI_DISCORD_ID) continue;

    const info = supabaseMembers.get(member.user.id);
    if (!info) {
      notInDB.push(member.user.tag);
      continue;
    }

    const tasks: Promise<unknown>[] = [];

    if (member.nickname !== info.nickname) {
      tasks.push(
        member.setNickname(info.nickname)
          .catch(() => failed.push(member.user.tag))
      );
      fixed.push(`${member.user.tag} → \`${info.nickname}\``);
    }

    if (!member.roles.cache.has(memberRoleId)) {
      tasks.push(
        member.roles.add(memberRoleId)
          .catch(() => failed.push(member.user.tag))
      );
    }

    if (tasks.length > 0) await Promise.all(tasks);
  }

  const truncate = (lines: string[], max = 20) =>
    lines.length > max
      ? [...lines.slice(0, max), `他 ${lines.length - max} 件`]
      : lines;

  const embed = new EmbedBuilder()
    .setTitle('ニックネーム確認・修正結果')
    .setColor(0x00bfff)
    .addFields(
      {
        name: `修正済み (${fixed.length} 件)`,
        value: fixed.length > 0 ? truncate(fixed).join('\n') : 'なし',
      },
      {
        name: `DB未登録 (${notInDB.length} 件)`,
        value: notInDB.length > 0 ? truncate(notInDB).join('\n') : 'なし',
      },
      {
        name: `エラー (${failed.length} 件)`,
        value: failed.length > 0 ? truncate(failed).join('\n') : 'なし',
      }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
