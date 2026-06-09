import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { TIMES_BUTTON_ID } from '../events/times';

export const data = new SlashCommandBuilder()
  .setName('times-panel')
  .setDescription('times チャンネル作成用のパネルをこのチャンネルに設置します')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TIMES_BUTTON_ID)
      .setLabel('times チャンネルを作成')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')
  );

  // パネル本体は通常メッセージとして送信し、コマンド使用の表示が残らないようにする
  if (interaction.channel?.isTextBased() && 'send' in interaction.channel) {
    await interaction.channel.send({
      content:
        '下のボタンから自分専用の **#times-◯◯** チャンネルを作成できます（一人一つまで）。',
      components: [row],
    });
  }

  // コマンドへの応答は本人だけに見える確認にとどめる
  await interaction.reply({
    content: 'パネルを設置しました。',
    flags: MessageFlags.Ephemeral,
  });
}
