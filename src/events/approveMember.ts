import { ButtonInteraction } from 'discord.js';
import { Resend } from 'resend';
import { supabase } from '../clients/supabase';

async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY missing');
  }
  const resend = new Resend(apiKey);
  const from = process.env.MAIL_FROM ?? 'noreply@mail.sazanami.dev';

  const text = `${name} さん\n\nさざなみ開発への入会申請が承認されました。\nポータルにログインして、DiscordやGitHubへの参加手続きをお進めください。\n\nhttps://portal.sazanami.dev\n\nご不明な点がございましたら、担当者までお問い合わせください。\n\n──\nさざなみ ポータル`;

  const html = `<p>${name} さん</p>
<p>さざなみ開発への入会申請が承認されました。<br>
ポータルにログインして、Discord や GitHub への参加手続きをお進めください。</p>
<p><a href="https://portal.sazanami.dev">https://portal.sazanami.dev</a></p>
<p>ご不明な点がございましたら、運営チームまでお問い合わせください。</p>
<hr>
<small>さざなみ ポータル</small>`;

  const { data, error } = await resend.emails.send({
    from: `さざなみ開発 <${from}>`,
    to,
    subject: '【さざなみ開発】入会申請が承認されました',
    text,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  console.log('[approveMember] email sent:', { to, name, id: data?.id });
}

export async function execute(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.customId.slice('approve_member:'.length);
  const originalContent = interaction.message.content;

  await interaction.deferUpdate();

  const { data, error } = await supabase
    .from('users')
    .update({
      status: 'active',
      role: 'member',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('status', 'pending')
    .select('id, email, name')
    .single();

  // PGRST116: 条件に一致する行なし（すでに処理済み）
  if (error && error.code !== 'PGRST116') {
    console.error('[approveMember] Supabase error:', error.message);
    await interaction.message.edit({
      content: originalContent + '\n\n❌ 承認に失敗しました',
      components: [],
    });
    return;
  }

  if (!data) {
    console.log('[approveMember] already processed:', userId);
    await interaction.message.edit({
      content: originalContent + '\n\n⚠️  すでに処理済みです',
      components: [],
    });
    return;
  }

  console.log('[approveMember] approved:', { userId, email: data.email, name: data.name });

  let mailOk = true;
  if (data.email && data.name) {
    try {
      await sendApprovalEmail(data.email, data.name);
    } catch (mailErr) {
      mailOk = false;
      console.error('[approveMember] email send failed:', mailErr);
    }
  } else {
    mailOk = false;
    console.error('[approveMember] missing email or name for user', userId);
  }

  const suffix = mailOk
    ? '\n\n✅ 承認しました'
    : '\n\n✅ 承認しました（⚠️ 承認メールの送信に失敗しました。手動で連絡してください）';

  await interaction.message.edit({
    content: originalContent + suffix,
    components: [],
  });
}
