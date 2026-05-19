import { ButtonInteraction } from 'discord.js';
import { supabase } from '../clients/supabase';

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
    .select('id')
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
    await interaction.message.edit({
      content: originalContent + '\n\n⚠️  すでに処理済みです',
      components: [],
    });
    return;
  }

  await interaction.message.edit({
    content: originalContent + '\n\n✅ 承認しました',
    components: [],
  });
}
