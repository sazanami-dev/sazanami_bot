import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { TICKET_BUTTON_ID } from '../events/ticket';

export const data = new SlashCommandBuilder()
  .setName('ticket-panel')
  .setDescription('運営チームへのお問い合わせ用パネルをこのチャンネルに設置します')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_BUTTON_ID)
      .setLabel('運営チームに相談する')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📩')
  );

  // パネル本体は通常メッセージとして送信し、コマンド使用の表示が残らないようにする
  if (interaction.channel?.isTextBased() && 'send' in interaction.channel) {
    await interaction.channel.send({
      content:
        '運営チームへ個人的に相談したいことがある場合は、下のボタンから専用のお問い合わせチャンネルを作成できます。\n' +
        '作成されたチャンネルは、あなたと運営チームだけが閲覧できます。',
      components: [row],
    });
  }

  // コマンドへの応答は本人だけに見える確認にとどめる
  await interaction.reply({
    content: 'パネルを設置しました。',
    flags: MessageFlags.Ephemeral,
  });
}
