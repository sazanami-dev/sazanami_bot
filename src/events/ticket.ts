import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  OverwriteType,
  PermissionFlagsBits,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  User,
} from 'discord.js';
import { client } from '../clients/discord';

// パネルのボタン／モーダル／閉じるボタンを識別する customId
export const TICKET_BUTTON_ID = 'ticket:open';
export const TICKET_MODAL_ID = 'ticket:submit';
export const TICKET_CLOSE_ID = 'ticket:close';
export const TICKET_REOPEN_ID = 'ticket:reopen';
// 運営が /ticket-create で出すモーダル（customId に対象ユーザーIDを付与する）
export const TICKET_STAFF_MODAL_PREFIX = 'ticket:staffcreate:';
const SUBJECT_INPUT_ID = 'subject';

// 閉鎖後、削除するまでの猶予期間（1週間）
const DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// 相談者の ID は topic に記録する（作成時に一度だけ。以後は更新しない）。
// Discord は topic 更新を「10分あたり2回」に制限するため、開閉のたびに更新する
// 閉鎖状態・閉鎖時刻は、レート制限のないボタンメッセージ側（埋め込み）に持たせる。
const ownerMarker = (userId: string) => `ticket-owner:${userId}`;

// 閉鎖時刻を埋め込みフッターに機械可読な形で記録するためのマーカー
const CLOSED_MARKER_PREFIX = 'ticket-closed:';

// topic から相談者の Discord ID を取り出す
function parseOwnerId(topic: string | null): string | null {
  const m = topic?.match(/ticket-owner:(\d+)/);
  return m ? m[1] : null;
}

// ボタンメッセージの埋め込みから閉鎖時刻（ms）を取り出す。開いている場合は null
function parseClosedAt(message: Message): number | null {
  for (const embed of message.embeds) {
    const text = embed.footer?.text ?? '';
    if (text.startsWith(CLOSED_MARKER_PREFIX)) {
      const at = Number(text.slice(CLOSED_MARKER_PREFIX.length));
      return Number.isNaN(at) ? null : at;
    }
  }
  return null;
}

// 閉鎖状態を表す埋め込み（フッターに閉鎖時刻を埋め込む）
function buildClosedEmbed(at: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x9aa0a6)
    .setDescription('🔒 このチケットは閉じられています')
    .setFooter({ text: `${CLOSED_MARKER_PREFIX}${at}` });
}

// 閉鎖時刻を持つ埋め込みかどうか
function isClosedEmbed(embed: { footer?: { text?: string } | null }): boolean {
  return embed.footer?.text?.startsWith(CLOSED_MARKER_PREFIX) ?? false;
}

// チケットの案内（操作方法）を表示する埋め込み。用件は別途テキストで送る。
function buildInfoEmbed(initiatedByStaff: boolean): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(
      initiatedByStaff
        ? '📩 運営チームからのご連絡'
        : '📩 運営チームへのお問い合わせ'
    )
    .setDescription(
      'このチャンネルで運営チームとやり取りできます。\n' +
        '解決しましたら、運営チームが下のボタンからチケットを閉じてください。'
    )
    .setFooter({ text: '閉鎖から1週間後に自動的に削除されます' });
}

// Discord のチャンネル名に使える形に整形する
function toSlug(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '')
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

// 「閉じる」ボタンの行
function buildCloseRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_ID)
      .setLabel('チケットを閉じる（運営用）')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒')
  );
}

// 「開く」ボタンの行（閉鎖後に表示）
function buildReopenRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_REOPEN_ID)
      .setLabel('チケットを再度開く（運営用）')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔓')
  );
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

// チケットチャンネルを作成する共通処理。
// パネル経由（相談者自身）でも、運営のスラッシュコマンド経由でも使う。
type CreateTicketResult =
  | { status: 'created'; channel: TextChannel }
  | { status: 'exists'; channel: TextChannel }
  | { status: 'error' };

export async function createTicketChannel(
  guild: Guild,
  owner: User,
  subject: string,
  initiatedByStaff: boolean
): Promise<CreateTicketResult> {
  const userId = owner.id;
  const categoryId = process.env.DISCORD_TICKET_CATEGORY_ID!;
  const staffRoleId = process.env.DISCORD_STAFF_ROLE_ID;

  // 1. 既に開いているチケットがないか確認（一人一つまで）。
  //    閉鎖状態はピン留めメッセージの埋め込みで判定する（topic は所有者のみ保持）。
  const channels = await guild.channels.fetch();
  const owned = [...channels.values()].filter(
    (ch): ch is TextChannel =>
      ch?.type === ChannelType.GuildText &&
      ch.parentId === categoryId &&
      parseOwnerId(ch.topic) === userId
  );
  for (const ch of owned) {
    const pinned = await ch.messages.fetchPinned().catch(() => null);
    const isOpen =
      !pinned || ![...pinned.values()].some((m) => parseClosedAt(m) !== null);
    if (isOpen) {
      return { status: 'exists', channel: ch };
    }
  }

  // 2. チャンネルを作成（相談者と運営ロールのみ閲覧可能な非公開チャンネル）
  //    チャンネル名にはサーバーでの表示名（ニックネーム）を使う。
  const member = await guild.members.fetch(userId).catch(() => null);
  const displayName = member?.displayName ?? owner.username;
  const slug = toSlug(displayName) || userId;
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
      `[ticket] created #${channel.name} (${channel.id}) for ${owner.tag} (${userId})` +
        (initiatedByStaff ? ' [staff-initiated]' : '')
    );

    // 3. チャンネル内に案内（埋め込み）と「閉じる」ボタンを投稿し、ピン留めする。
    //    このメッセージが開閉状態・閉鎖時刻の保存先になるため、自動削除処理が
    //    ピン留めメッセージから確実に見つけられるようにする。
    //    本文（content）は通知用に対象者と運営をメンションするだけにし、
    //    用件は埋め込みで見やすく表示する。
    //    案内は埋め込みで表示し、用件のみ通常テキスト（content）で送る。
    const mention = staffRoleId ? `<@&${staffRoleId}>` : '運営チーム';
    const label = initiatedByStaff ? '用件' : '相談内容';
    const intro = await channel.send({
      content: `<@${userId}> さん / ${mention}\n\n## ${label}\n${subject}`,
      embeds: [buildInfoEmbed(initiatedByStaff)],
      components: [buildCloseRow()],
    });
    await intro.pin().catch((err) => console.error('[ticket] failed to pin intro:', err));

    return { status: 'created', channel };
  } catch (err) {
    console.error(`[ticket] failed for ${owner.tag} (${userId}):`, err);
    return { status: 'error' };
  }
}

// モーダルが送信されたら相談者自身のチケットチャンネルを作成する
export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const subject = interaction.fields.getTextInputValue(SUBJECT_INPUT_ID);
  console.log(`[ticket] create requested by ${interaction.user.tag} (${interaction.user.id})`);

  const result = await createTicketChannel(
    interaction.guild!,
    interaction.user,
    subject,
    false
  );

  if (result.status === 'exists') {
    await interaction.editReply(
      `あなたは既に <#${result.channel.id}> でお問い合わせ中です。新しく作成する前に、そちらでご相談ください。`
    );
  } else if (result.status === 'created') {
    await interaction.editReply(
      `お問い合わせチャンネルを作成しました： <#${result.channel.id}>\nこちらで運営チームとやり取りができます。`
    );
  } else {
    await interaction.editReply(
      'チケットの作成に失敗しました。お手数ですが運営チームまで直接ご連絡ください。'
    );
  }
}

// /ticket-create 用のモーダルを組み立てる（対象ユーザーIDを customId に埋め込む）
export function buildStaffCreateModal(targetUserId: string): ModalBuilder {
  const subjectInput = new TextInputBuilder()
    .setCustomId(SUBJECT_INPUT_ID)
    .setLabel('用件')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder('対象ユーザーに伝える内容を入力してください');

  return new ModalBuilder()
    .setCustomId(`${TICKET_STAFF_MODAL_PREFIX}${targetUserId}`)
    .setTitle('チケットを作成')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput)
    );
}

// /ticket-create のモーダルが送信されたら、対象ユーザー宛にチケットを作成する
export async function handleStaffCreateModal(
  interaction: ModalSubmitInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targetId = interaction.customId.slice(TICKET_STAFF_MODAL_PREFIX.length);
  const subject = interaction.fields.getTextInputValue(SUBJECT_INPUT_ID);
  const target = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.editReply('対象ユーザーが見つかりませんでした。');
    return;
  }

  console.log(
    `[ticket] create requested by ${interaction.user.tag} for ${target.tag} (${targetId})`
  );

  const result = await createTicketChannel(interaction.guild!, target, subject, true);

  if (result.status === 'exists') {
    await interaction.editReply(
      `${target} さんには既に開いているチケットがあります： <#${result.channel.id}>`
    );
  } else if (result.status === 'created') {
    await interaction.editReply(
      `${target} さん宛のチケットを作成しました： <#${result.channel.id}>`
    );
  } else {
    await interaction.editReply(
      'チケットの作成に失敗しました。Bot の権限やカテゴリ設定を確認してください。'
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

  if (parseClosedAt(interaction.message) !== null) {
    await interaction.reply({
      content: 'このチケットは既に閉じられています。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const now = Date.now();
  const ownerId = parseOwnerId(channel.topic);

  // 1. 相談者を閲覧のみ（書き込み不可）にする
  if (ownerId) {
    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        SendMessages: false,
      })
      .catch((err) => console.error('[ticket] failed to update owner perms:', err));
  }

  // 2. 閉じるボタンを「開く」ボタンに差し替え、閉鎖時刻を埋め込みに記録する。
  //    （topic は更新回数の制限が厳しいため使わない）
  //    案内の埋め込みは残し、閉鎖を示す埋め込みを追加する。
  const keepEmbeds = interaction.message.embeds
    .filter((e) => !isClosedEmbed(e))
    .map((e) => EmbedBuilder.from(e));
  await interaction.message
    .edit({
      components: [buildReopenRow()],
      embeds: [...keepEmbeds, buildClosedEmbed(now)],
    })
    .catch((err) => console.error('[ticket] failed to update intro message:', err));

  const deleteDate = new Date(now + DELETE_AFTER_MS);
  await channel.send(
    `🔒 ${interaction.user} がこのチケットを閉じました。\n` +
      `履歴は ${deleteDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} 頃まで閲覧できます（その後自動削除されます）。\n` +
      '間違えて閉じた場合は、運営チームが上の「開く」ボタンから再開できます。'
  );

  console.log(
    `[ticket] closed #${channel.name} (${channel.id}) by ${interaction.user.tag}`
  );
}

// 「開く」ボタンが押されたらチケットを再開する（運営のみ）
export async function handleReopen(interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!isStaff(member)) {
    await interaction.reply({
      content: 'チケットを再開できるのは運営チームのみです。',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return;

  if (parseClosedAt(interaction.message) === null) {
    await interaction.reply({
      content: 'このチケットは既に開いています。',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const ownerId = parseOwnerId(channel.topic);

  // 1. 相談者の書き込みを再度許可する
  if (ownerId) {
    await channel.permissionOverwrites
      .edit(ownerId, {
        ViewChannel: true,
        SendMessages: true,
      })
      .catch((err) => console.error('[ticket] failed to restore owner perms:', err));
  }

  // 2. 「開く」ボタンを「閉じる」ボタンに戻し、閉鎖を示す埋め込みだけを消す
  //    （案内の埋め込みは残す。これで自動削除の対象から外れる）
  const keepEmbeds = interaction.message.embeds
    .filter((e) => !isClosedEmbed(e))
    .map((e) => EmbedBuilder.from(e));
  await interaction.message
    .edit({ components: [buildCloseRow()], embeds: keepEmbeds })
    .catch((err) => console.error('[ticket] failed to update intro message:', err));

  await channel.send(`🔓 ${interaction.user} がこのチケットを再開しました。`);

  console.log(
    `[ticket] reopened #${channel.name} (${channel.id}) by ${interaction.user.tag}`
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
      // チケットチャンネル以外（手動作成のチャンネル等）は対象外
      if (parseOwnerId(ch.topic) === null) continue;

      // 閉鎖時刻はピン留めしたボタンメッセージの埋め込みに保存されている
      const pinned = await ch.messages.fetchPinned().catch(() => null);
      if (!pinned) continue;

      let closedAt: number | null = null;
      for (const msg of pinned.values()) {
        const at = parseClosedAt(msg);
        if (at !== null) {
          closedAt = at;
          break;
        }
      }

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
