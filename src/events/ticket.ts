import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  GuildMember,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteType,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { client } from '../clients/discord';

// パネルのボタン／モーダル／閉じるボタンを識別する customId
export const TICKET_BUTTON_ID = 'ticket:open';
export const TICKET_MODAL_ID = 'ticket:submit';
export const TICKET_CLOSE_ID = 'ticket:close';
const SUBJECT_INPUT_ID = 'subject';

// 閉鎖後、削除するまでの猶予期間（1週間）
const DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// チャンネルの状態を topic に埋め込んで永続化する（DB 不要）
const ownerMarker = (userId: string) => `ticket-owner:${userId}`;
const closedMarker = (at: number) => `ticket-closed:${at}`;

// topic から相談者の Discord ID を取り出す
function parseOwnerId(topic: string | null): string | null {
  const m = topic?.match(/ticket-owner:(\d+)/);
  return m ? m[1] : null;
}

// topic から閉鎖時刻（ms）を取り出す。開いている場合は null
function parseClosedAt(topic: string | null): number | null {
  const m = topic?.match(/ticket-closed:(\d+)/);
  return m ? Number(m[1]) : null;
}

// Discord のチャンネル名に使える形に整形する
function toSlug(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^0-9a-z\-_ぁ-んァ-ヶー一-龠々]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// 操作者が運営かどうか（運営ロール所持 or チャンネル管理権限）
function isStaff(member: GuildMember | null): boolean {
  if (!member) return false;
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;
  if (staffRoleId && member.roles.cache.has(staffRoleId)) return true;
  return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

// パネルのボタンが押されたらモーダルを表示する
export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const subjectInput = new TextInputBuilder()
    .setCustomId(SUBJECT_INPUT_ID)
    .setLabel('相談内容（件名）')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder('運営チームに相談したい内容を簡潔にご記入ください');

  const modal = new ModalBuilder()
    .setCustomId(TICKET_MODAL_ID)
    .setTitle('運営チームへのお問い合わせ')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput)
    );

  await interaction.showModal(modal);
}

// モーダルが送信されたらチケットチャンネルを作成する
export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild!;
  const userId = interaction.user.id;
  const categoryId = process.env.DISCORD_TICKET_CATEGORY_ID!;
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;

  const subject = interaction.fields.getTextInputValue(SUBJECT_INPUT_ID);
  console.log(
    `[ticket] create requested by ${interaction.user.tag} (${userId})`
  );

  // 1. 既に開いているチケットがないか確認（一人一つまで）
  const channels = await guild.channels.fetch();
  const existing = channels.find(
    (ch): ch is TextChannel =>
      ch?.type === ChannelType.GuildText &&
      ch.parentId === categoryId &&
      parseOwnerId(ch.topic) === userId &&
      parseClosedAt(ch.topic) === null
  );
  if (existing) {
    console.log(
      `[ticket] rejected (already has ${existing.name}) by ${interaction.user.tag} (${userId})`
    );
    await interaction.editReply(
      `あなたは既に <#${existing.id}> でお問い合わせ中です。新しく作成する前に、そちらでご相談ください。`
    );
    return;
  }

  // 2. チャンネルを作成（相談者と運営ロールのみ閲覧可能な非公開チャンネル）
  const slug = toSlug(interaction.user.username) || userId;
  const channelName = `ticket-${slug}`;

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: ownerMarker(userId),
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        ...(staffRoleId
          ? [
              {
                id: staffRoleId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                ],
                type: OverwriteType.Role,
              },
            ]
          : []),
      ],
    });

    console.log(
      `[ticket] created #${channel.name} (${channel.id}) by ${interaction.user.tag} (${userId})`
    );

    // 3. チャンネル内に案内と「閉じる」ボタンを投稿
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(TICKET_CLOSE_ID)
        .setLabel('チケットを閉じる（運営用）')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    );

    const mention = staffRoleId ? `<@&${staffRoleId}>` : '運営チーム';
    await channel.send({
      content:
        `${interaction.user} さんからのお問い合わせです（${mention}）。\n\n` +
        `**相談内容**\n${subject}\n\n` +
        '解決しましたら、運営チームが下のボタンからチケットを閉じてください。\n' +
        '閉じてから1週間後にこのチャンネルは自動的に削除されます。',
      components: [closeRow],
    });

    await interaction.editReply(
      `お問い合わせチャンネルを作成しました： <#${channel.id}>\nこちらで運営チームとやり取りができます。`
    );
  } catch (err) {
    console.error(`[ticket] failed for ${interaction.user.tag} (${userId}):`, err);
    await interaction.editReply(
      'チケットの作成に失敗しました。お手数ですが運営チームまで直接ご連絡ください。'
    );
  }
}

// 「閉じる」ボタンが押されたらチケットを閉鎖する（運営のみ）
export async function handleClose(interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!isStaff(member)) {
    await interaction.reply({
      content: 'チケットを閉じられるのは運営チームのみです。',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  if (parseClosedAt(channel.topic) !== null) {
    await interaction.reply({
      content: 'このチケットは既に閉じられています。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const now = Date.now();
  const ownerId = parseOwnerId(channel.topic);

  // 1. topic に閉鎖時刻を記録（自動削除の起点になる）
  const baseTopic = ownerId ? ownerMarker(ownerId) : '';
  await channel.setTopic(`${baseTopic} ${closedMarker(now)}`.trim());

  // 2. 相談者を閲覧のみ（書き込み不可）にする
  if (ownerId) {
    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        SendMessages: false,
      })
      .catch((err) => console.error('[ticket] failed to update owner perms:', err));
  }

  // 3. 閉じるボタンを取り除き、閉鎖を告知
  await interaction.message.edit({ components: [] }).catch(() => {});

  const deleteDate = new Date(now + DELETE_AFTER_MS);
  await channel.send(
    `🔒 ${interaction.user} がこのチケットを閉じました。\n` +
      `履歴は ${deleteDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} 頃まで閲覧できます（その後自動削除されます）。`
  );

  console.log(
    `[ticket] closed #${channel.name} (${channel.id}) by ${interaction.user.tag}`
  );
}

// 閉鎖から1週間経過したチケットを削除する定期処理
export async function sweepClosedTickets(): Promise<void> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const categoryId = process.env.DISCORD_TICKET_CATEGORY_ID;
  if (!guildId || !categoryId) return;

  try {
    const guild = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const now = Date.now();

    for (const ch of channels.values()) {
      if (!ch || ch.type !== ChannelType.GuildText) continue;
      if (ch.parentId !== categoryId) continue;

      const closedAt = parseClosedAt(ch.topic);
      if (closedAt !== null && now - closedAt >= DELETE_AFTER_MS) {
        await ch
          .delete('閉鎖から1週間経過したチケットの自動削除')
          .then(() => console.log(`[ticket] auto-deleted #${ch.name} (${ch.id})`))
          .catch((err) =>
            console.error(`[ticket] auto-delete failed for ${ch.id}:`, err)
          );
      }
    }
  } catch (err) {
    console.error('[ticket] sweep failed:', err);
  }
}
