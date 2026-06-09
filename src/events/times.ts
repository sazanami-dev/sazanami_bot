import {
  ActionRowBuilder,
  ButtonInteraction,
  ChannelType,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// パネルのボタン／モーダルを識別する customId
export const TIMES_BUTTON_ID = 'times:open';
export const TIMES_MODAL_ID = 'times:submit';
const NAME_INPUT_ID = 'name';

// チャンネルの所有者を識別するためのマーカー（topic に埋め込む）
const ownerMarker = (userId: string) => `times-owner:${userId}`;

// Discord のチャンネル名に使える形に整形する
function toSlug(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    // 英数・ひらがな・カタカナ・漢字・ハイフン/アンダースコア以外を除去
    .replace(/[^0-9a-z\-_ぁ-んァ-ヶー一-龠々]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// パネルのボタンが押されたらモーダルを表示する
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const nameInput = new TextInputBuilder()
    .setCustomId(NAME_INPUT_ID)
    .setLabel('#times-◯◯ の ◯◯ の部分')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80)
    .setPlaceholder('例: taro');

  const modal = new ModalBuilder()
    .setCustomId(TIMES_MODAL_ID)
    .setTitle('times チャンネルを作成')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput)
    );

  await interaction.showModal(modal);
}

// モーダルが送信されたらチャンネルを作成する
export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const categoryId = process.env.DISCORD_TIMES_CATEGORY_ID!;

  // 1. チャンネル名を整形・検証
  const slug = toSlug(interaction.fields.getTextInputValue(NAME_INPUT_ID));
  if (!slug) {
    await interaction.editReply(
      '使用できる文字が含まれていません。英数字・ひらがな・カタカナ・漢字で名前を指定してください。'
    );
    return;
  }
  const channelName = `times-${slug}`;

  // 2. 一人一つまで（カテゴリ内に既に自分のチャンネルがないか確認）
  const channels = await guild.channels.fetch();
  const existing = channels.find(
    (ch): ch is TextChannel =>
      ch?.type === ChannelType.GuildText &&
      ch.parentId === categoryId &&
      ch.topic?.includes(ownerMarker(userId)) === true
  );
  if (existing) {
    await interaction.editReply(
      `あなたは既に <#${existing.id}> を作成済みです。times チャンネルは一人一つまでです。`
    );
    return;
  }

  // 3. チャンネルを作成
  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: ownerMarker(userId),
      permissionOverwrites: [
        {
          id: userId,
          allow: [PermissionFlagsBits.PinMessages],
        },
      ],
    });

    await interaction.editReply(`チャンネルを作成しました： <#${channel.id}>`);
    // 作成の告知は全員に見えるよう、返信ではなく通常メッセージとして投稿する
    if (interaction.channel?.isTextBased() && 'send' in interaction.channel) {
      await interaction.channel.send(
        `${interaction.user} が times チャンネルを作成しました： <#${channel.id}>`
      );
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply(
      'チャンネルの作成に失敗しました。Bot の権限やカテゴリ設定を確認してください。'
    );
  }
}
