/**
 * ポータルのお知らせ予約投稿を Discord へ送信させるための定期実行。
 *
 * 送信処理そのものはポータル側（/api/cron/announcements/discord）が行う。
 * bot は常駐しているので、そのスケジューラ役だけを担う。
 */

/** 予約時刻からの遅延は呼び出し間隔がそのまま効くため、1 分ごとに叩く */
const INTERVAL_MS = 60 * 1000

/**
 * ポータル側は 1 回あたり 40 秒で処理を打ち切り、残りを次回に回す。
 * それより短く打ち切ると「タイムアウトしたのに実際は送信済み」になるため、
 * 余裕を持たせた値にする。
 */
const REQUEST_TIMEOUT_MS = 55 * 1000

type CronSummary = {
  recovered: number
  processed: number
  sent: number
  failed: number
  skipped: number
  /** レート制限や時間切れで次回に回された件数 */
  deferred: number
}

function endpoint(): string | null {
  const baseUrl = process.env.PORTAL_URL?.trim()
  if (!baseUrl) return null
  return `${baseUrl.replace(/\/+$/, '')}/api/cron/announcements/discord`
}

/** 1 回分の実行。失敗してもログだけ出して bot は落とさない */
export async function runAnnouncementCron(): Promise<void> {
  const url = endpoint()
  const secret = process.env.PORTAL_CRON_SECRET?.trim()
  if (!url || !secret) return

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[announcementCron] failed:', res.status, detail.slice(0, 300))
      return
    }

    const summary = (await res.json()) as CronSummary
    // 何も起きなかった実行はログを出さない（1 分ごとに動くため）
    if (summary.sent > 0 || summary.failed > 0 || summary.recovered > 0 || summary.deferred > 0) {
      console.log('[announcementCron]', JSON.stringify(summary))
    }
  } catch (error) {
    console.error('[announcementCron] error:', error)
  }
}

/** 起動時に 1 回実行し、以降は一定間隔で叩き続ける */
export function startAnnouncementCron(): void {
  if (!endpoint() || !process.env.PORTAL_CRON_SECRET?.trim()) {
    console.warn(
      '[announcementCron] PORTAL_URL / PORTAL_CRON_SECRET が未設定のため、お知らせの予約投稿は送信されません'
    )
    return
  }

  void runAnnouncementCron()
  setInterval(() => {
    void runAnnouncementCron()
  }, INTERVAL_MS)
}
