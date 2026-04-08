// supabase/functions/push-dispatch/index.ts
// Web Push 발송 — notifications/messages INSERT webhook 처리 (Deno 네이티브)

import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// 환경 변수
// ============================================================
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@jdicompany.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ACTIVE_THRESHOLD_MS = 10_000;

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("VAPID keys missing");
}

// ============================================================
// base64url 유틸 + 원시 VAPID 키 → JWK 변환
// ============================================================
function base64UrlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function base64UrlEncode(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 원시 base64url 키 → JWK (EC P-256)
function rawVapidToJwk(publicB64: string, privateB64: string): {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
} {
  const pub = base64UrlDecode(publicB64); // 65 bytes: 0x04 | X(32) | Y(32)
  const priv = base64UrlDecode(privateB64); // 32 bytes
  const x = base64UrlEncode(pub.slice(1, 33));
  const y = base64UrlEncode(pub.slice(33, 65));
  const d = base64UrlEncode(priv);
  return {
    publicKey: { kty: "EC", crv: "P-256", x, y, ext: true },
    privateKey: { kty: "EC", crv: "P-256", x, y, d, ext: true },
  };
}

// ============================================================
// ApplicationServer 초기화 (콜드스타트 시 1회)
// ============================================================
const vapidKeys = await webpush.importVapidKeys(
  rawVapidToJwk(VAPID_PUBLIC, VAPID_PRIVATE),
  { extractable: false },
);

const appServer = await webpush.ApplicationServer.new({
  contactInformation: VAPID_SUBJECT,
  vapidKeys,
});

// ============================================================
// Supabase 클라이언트 (service role)
// ============================================================
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// 타입
// ============================================================
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

interface PushPayload {
  title: string;
  body: string;
  link: string;
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ============================================================
// 알림 종류 → notification_settings 컬럼
// ============================================================
const SETTING_KEY_BY_TYPE: Record<string, string> = {
  task_assigned: "task_deadline",
  task_comment: "task_deadline",
  task_status_changed: "task_deadline",
  task_deadline: "task_deadline",
  vacation_approved: "vacation_notify",
  vacation_rejected: "vacation_notify",
  schedule_invite: "schedule_remind",
  system_announce: "system_announce",
  signup_pending: "system_announce",
  chat_message: "chat_message_notify",
};

// ============================================================
// 수신자 결정
// ============================================================
async function resolveRecipientsForNotifications(
  record: Record<string, unknown>,
): Promise<{ userIds: string[]; payload: PushPayload; settingKey: string | null }> {
  const userId = record.user_id as string;
  const type = record.type as string;
  const title = (record.title as string) || "JDI 포털";
  const body = (record.body as string) || "";
  const link = (record.link as string) || "/dashboard";
  const settingKey = SETTING_KEY_BY_TYPE[type] ?? null;
  return {
    userIds: [userId],
    payload: { title, body, link, tag: `notif:${record.id}` },
    settingKey,
  };
}

async function resolveRecipientsForMessages(
  record: Record<string, unknown>,
): Promise<{ userIds: string[]; payload: PushPayload; settingKey: string; channelId: string } | null> {
  const channelId = record.channel_id as string;
  const senderId = record.user_id as string;
  const msgType = (record.type as string) || "text";
  const content = (record.content as string) || "";

  if (msgType === "system") return null;

  const { data: channel } = await supabase
    .from("channels")
    .select("name, type")
    .eq("id", channelId)
    .single();
  if (!channel || channel.type === "memo") return null;

  const { data: sender } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", senderId)
    .single();
  const senderName = sender?.full_name ?? "알 수 없음";

  const { data: members } = await supabase
    .from("channel_members")
    .select("user_id, is_muted, last_seen_at")
    .eq("channel_id", channelId);
  if (!members) return null;

  const cutoff = Date.now() - ACTIVE_THRESHOLD_MS;
  const candidates = members
    .filter((m) => m.user_id !== senderId)
    .filter((m) => !m.is_muted)
    .filter((m) => {
      if (!m.last_seen_at) return true;
      return new Date(m.last_seen_at).getTime() < cutoff;
    })
    .map((m) => m.user_id);

  if (candidates.length === 0) return null;

  let preview: string;
  if (msgType === "image") preview = "사진을 보냈습니다";
  else if (msgType === "file") preview = "파일을 보냈습니다";
  else preview = content.length > 100 ? content.slice(0, 100) + "..." : content;

  return {
    userIds: candidates,
    payload: {
      title: `${channel.name} - ${senderName}`,
      body: preview,
      link: `/dashboard/chat/${channelId}`,
      tag: `chat:${channelId}`,
    },
    settingKey: "chat_message_notify",
    channelId,
  };
}

// ============================================================
// settings 필터링
// ============================================================
async function filterBySettings(
  userIds: string[],
  settingKey: string | null,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data: rows } = await supabase
    .from("notification_settings")
    .select("user_id, push_enabled, " + (settingKey ?? "user_id"))
    .in("user_id", userIds);
  if (!rows) return [];

  return rows
    .filter((r) => (r as Record<string, unknown>).push_enabled === true)
    .filter((r) => {
      if (!settingKey) return true;
      return (r as Record<string, unknown>)[settingKey] !== false;
    })
    .map((r) => r.user_id as string);
}

// ============================================================
// Push 발송
// ============================================================
async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return;

  await Promise.allSettled(
    (subs as SubscriptionRow[]).map(async (sub) => {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        });
        await subscriber.pushTextMessage(JSON.stringify(payload), {
          ttl: 60 * 60,
        });
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (err) {
        // @negrel/webpush의 PushMessageError 처리
        const e = err as { isGone?: () => boolean; response?: { status?: number } };
        const status = e.response?.status;
        if ((e.isGone && e.isGone()) || status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", status, err);
        }
      }
    }),
  );
}

// ============================================================
// HTTP 진입점
// ============================================================
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (body.type !== "INSERT") {
    return new Response("ignored", { status: 200 });
  }

  try {
    let userIds: string[] = [];
    let payload: PushPayload | null = null;
    let settingKey: string | null = null;

    if (body.table === "notifications") {
      const r = await resolveRecipientsForNotifications(body.record);
      userIds = r.userIds;
      payload = r.payload;
      settingKey = r.settingKey;
    } else if (body.table === "messages") {
      const r = await resolveRecipientsForMessages(body.record);
      if (!r) return new Response("skipped", { status: 200 });
      userIds = r.userIds;
      payload = r.payload;
      settingKey = r.settingKey;
    } else {
      return new Response("ignored table", { status: 200 });
    }

    const filtered = await filterBySettings(userIds, settingKey);
    if (filtered.length === 0 || !payload) {
      return new Response("no recipients", { status: 200 });
    }

    await sendPushToUsers(filtered, payload);
    return new Response(JSON.stringify({ sent: filtered.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("dispatch error", err);
    return new Response("internal error", { status: 500 });
  }
});
