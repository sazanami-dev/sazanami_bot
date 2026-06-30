import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildStaffCreateModal } from '../events/ticket';

export const data = new SlashCommandBuilder()
  .setName('ticket-create')
  .setDescription('特定のユーザー宛にお問い合わせ（チケット）チャンネルを作成します')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('連絡したいユーザー')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser('user', true);

  if (target.bot) {
    await interaction.reply({
      content: 'Bot 宛にはチケットを作成できません。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 用件はモーダルで入力させる（対象ユーザーは customId 経由で引き継ぐ）
  await interaction.showModal(buildStaffCreateModal(target.id));
}
