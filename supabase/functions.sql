-- Discord IDで1人のユーザー情報を取得する関数（guildMemberAdd イベント用）
CREATE OR REPLACE FUNCTION public.get_user_by_discord_id(discord_user_id text)
RETURNS TABLE(name varchar, class_name varchar)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.name, u.class_name
  FROM public.users u
  JOIN auth.identities i ON i.user_id = u.id
  WHERE i.provider = 'discord'
    AND i.provider_id = discord_user_id;
$$;

-- 全Discordメンバーのユーザー情報を取得する関数（/check-nicknames コマンド用）
CREATE OR REPLACE FUNCTION public.get_all_discord_members()
RETURNS TABLE(discord_id text, name varchar, class_name varchar)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.provider_id AS discord_id, u.name, u.class_name
  FROM public.users u
  JOIN auth.identities i ON i.user_id = u.id
  WHERE i.provider = 'discord';
$$;
