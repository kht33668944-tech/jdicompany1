"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";
import { syncContractFromCampaign } from "@/lib/influencer/contracts/linkSync";
import type { CampaignStatus, InfluencerCampaign, InfluencerListItem } from "./types";
import type { MilestoneKind } from "./calendar";
import { getInfluencers } from "./queries";

const MILESTONE_COLUMN: Record<
  MilestoneKind,
  "contact_date" | "contract_date" | "ship_date" | "content_deadline" | "expected_post_date"
> = {
  dm: "contact_date",
  contract: "contract_date",
  ship: "ship_date",
  deadline: "content_deadline",
  post: "expected_post_date",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getSessionUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return session.user.id;
}

// 캠페인 수정은 연결된 TMA 계약에도 같은 값을 남겨야 한다(한쪽만 고치면 다음 계약
// 저장 때 되돌아간다). 계약과 무관한 캠페인이면 syncContractFromCampaign 이 그냥 통과한다.

function validateInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.instagram.com" || parsed.hostname === "instagram.com") &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function extractUsernameFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "www.instagram.com" && parsed.hostname !== "instagram.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
}

// 검색어는 PostgREST `or(...ilike...)` 문자열에 그대로 들어가므로,
// 필터 문법을 깨뜨리는 문자(콤마·괄호·와일드카드 등)를 미리 제거한다.
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()*%\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// 검색은 이미 화면에 불러온 목록(1페이지 25명)만으로는 부족하므로 서버에서 전체를 찾는다.
export async function searchInfluencers(query: string): Promise<InfluencerListItem[]> {
  const term = sanitizeSearchTerm(query);
  if (term.length < 2) return [];
  await getSessionUserId();
  return getInfluencers({
    status: "active",
    search: term,
    sortBy: "engagement_rate",
    sortOrder: "desc",
    page: 1,
    pageSize: 50,
  });
}

/**
 * 활성 인플루언서 전체 로드.
 *
 * 목록은 속도를 위해 25명씩 끊어 불러오는데, 그러면 상태·등급 필터가 "불러온 25명"
 * 안에서만 걸러져 나머지가 통째로 빠진다. 그래서 필터를 켜는 순간 이 액션으로 전체를
 * 받아 온다(시즌당 수백 명 규모라 한 번에 받아도 부담이 없다).
 */
export async function loadAllInfluencers(): Promise<InfluencerListItem[]> {
  await getSessionUserId();
  return getInfluencers({
    status: "active",
    sortBy: "engagement_rate",
    sortOrder: "desc",
    page: 1,
    pageSize: 1000,
  });
}

export async function loadMoreInfluencers(page: number): Promise<InfluencerListItem[]> {
  if (!Number.isInteger(page) || page < 2) throw new Error("Invalid influencer page.");
  await getSessionUserId();
  return getInfluencers({
    status: "active",
    sortBy: "engagement_rate",
    sortOrder: "desc",
    page,
    pageSize: 25,
  });
}

// ============================================================
// 인플루언서
// ============================================================

export async function addInfluencer(
  profileUrl: string
): Promise<{ ok: true; influencer_id: string; alreadyExisted?: boolean }> {
  if (!validateInstagramUrl(profileUrl)) {
    throw new Error("올바른 인스타그램 프로필 URL을 입력해 주세요.");
  }

  const username = extractUsernameFromUrl(profileUrl);
  if (!username) {
    throw new Error("URL에서 사용자명을 추출할 수 없습니다.");
  }

  await getSessionUserId();
  const supabase = await createClient();

  // 이미 등록되어 있으면 Apify 호출 없이 기존 ID 반환 (비용·시간 절감)
  const { data: existing } = await supabase
    .from("influencers")
    .select("id")
    .eq("platform", "instagram")
    .eq("username", username)
    .maybeSingle();

  if (existing) {
    return { ok: true, influencer_id: existing.id, alreadyExisted: true };
  }

  const { data: extractData, error: extractError } = await supabase.functions.invoke(
    "influencer-extract",
    { body: { profile_url: profileUrl } }
  );

  if (extractError) throw new Error(`인플루언서 정보 수집 실패: ${extractError.message}`);

  const influencerId = (extractData as { influencer_id: string }).influencer_id;

  // analyze는 실패해도 인플루언서 등록 상태는 유지 (await로 완료 보장)
  try {
    await supabase.functions.invoke("influencer-analyze", {
      body: { influencer_id: influencerId },
    });
  } catch {
    // 분석 실패는 무시
  }

  revalidatePath("/dashboard/influencer");
  return { ok: true, influencer_id: influencerId };
}

export async function resyncAllInfluencers(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  await getSessionUserId();
  const supabase = await createClient();

  const { data: list, error } = await supabase
    .from("influencers")
    .select("id, profile_url")
    .eq("status", "active");

  if (error) throw error;
  const items = list ?? [];

  let success = 0;
  let failed = 0;

  // Apify rate limit 회피를 위해 순차 호출
  for (const inf of items) {
    try {
      const { data: extractData, error: extractError } = await supabase.functions.invoke(
        "influencer-extract",
        { body: { profile_url: inf.profile_url } },
      );
      if (extractError) {
        failed++;
        continue;
      }
      const influencerId = (extractData as { influencer_id: string }).influencer_id;
      try {
        await supabase.functions.invoke("influencer-analyze", {
          body: { influencer_id: influencerId },
        });
      } catch {
        // 분석 실패는 무시
      }
      success++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/dashboard/influencer");
  return { total: items.length, success, failed };
}

export async function resyncInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("influencers")
    .select("profile_url")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const { data: extractData, error: extractError } = await supabase.functions.invoke(
    "influencer-extract",
    { body: { profile_url: data.profile_url } }
  );

  if (extractError) throw new Error(`재동기화 실패: ${extractError.message}`);

  const influencerId = (extractData as { influencer_id: string }).influencer_id;

  try {
    await supabase.functions.invoke("influencer-analyze", {
      body: { influencer_id: influencerId },
    });
  } catch {
    // 분석 실패는 무시
  }

  revalidatePath("/dashboard/influencer");
}

export async function analyzeInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase.functions.invoke("influencer-analyze", {
    body: { influencer_id: id },
  });

  if (error) throw new Error(`AI 분석 실패: ${error.message}`);

  revalidatePath("/dashboard/influencer");
}

export async function archiveInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function unarchiveInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function deleteInfluencer(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  // CASCADE로 posts/campaigns/sync_logs 자동 삭제
  const { error } = await supabase.from("influencers").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function updateInfluencerNotes(id: string, notes: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

export async function updateInfluencerTags(id: string, tags: string[]): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencers")
    .update({ tags, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/dashboard/influencer");
}

// ============================================================
// 캠페인
// ============================================================

/**
 * 시딩건만 단독으로 만든다.
 *
 * **화면에서는 더 이상 쓰지 않는다.** 시딩 1건 = 계약 1건이 규칙이라, 리스트의
 * 「+ 시딩 시작」은 `startSeeding`(contracts/actions.ts)을 부르고 계약이 시딩건을
 * 만들어 붙인다. 계약 없는 시딩건을 다시 만들면 상태가 6단계로 갈라지고
 * 계약 탭에 안 보이는 진행 건이 생긴다 — 새 화면에서 이 함수를 부르지 말 것.
 * (상세 패널의 「+ 캠페인 추가」처럼 계약과 무관한 과거 경로만 남아 있다.)
 */
export async function addCampaign(input: {
  influencer_id: string;
  campaign_name: string;
  product_name?: string;
  cost?: number;
  contact_date?: string;
  contract_date?: string;
  ship_date?: string;
  content_deadline?: string;
  expected_post_date?: string;
  notes?: string;
}): Promise<InfluencerCampaign> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .insert({
      influencer_id: input.influencer_id,
      created_by: userId,
      campaign_name: input.campaign_name,
      status: "planned" as CampaignStatus,
      product_name: input.product_name ?? null,
      cost: input.cost ?? null,
      contact_date: input.contact_date ?? null,
      contract_date: input.contract_date ?? null,
      ship_date: input.ship_date ?? null,
      content_deadline: input.content_deadline ?? null,
      expected_post_date: input.expected_post_date ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/dashboard/influencer");
  return data as InfluencerCampaign;
}

export async function updateCampaignStatus(
  campaign_id: string,
  status: CampaignStatus
): Promise<void> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaign_id);

  if (error) throw error;
  await syncContractFromCampaign(supabase, userId, campaign_id, { status });
  revalidatePath("/dashboard/influencer");
}

export async function updateCampaign(
  id: string,
  input: Partial<
    Pick<
      InfluencerCampaign,
      | "campaign_name"
      | "status"
      | "product_name"
      | "cost"
      | "contact_date"
      | "contract_date"
      | "ship_date"
      | "content_deadline"
      | "expected_post_date"
      | "actual_post_date"
      | "post_url"
      | "notes"
    >
  >
): Promise<void> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  // 입력에 들어온 항목만 계약에 옮긴다(빠진 항목을 null 로 지우지 않도록)
  await syncContractFromCampaign(supabase, userId, id, {
    ...("status" in input && { status: input.status }),
    ...("cost" in input && { cost: input.cost }),
    ...("ship_date" in input && { ship_date: input.ship_date }),
    ...("content_deadline" in input && { content_deadline: input.content_deadline }),
    ...("expected_post_date" in input && { expected_post_date: input.expected_post_date }),
    ...("actual_post_date" in input && { actual_post_date: input.actual_post_date }),
  });
  revalidatePath("/dashboard/influencer");
}

/**
 * 시딩건 삭제. **TMA 계약과 연결된 건은 여기서 지울 수 없다.**
 *
 * 예전에는 그냥 지웠는데, DB 가 계약의 campaign_id 만 조용히 비워 버려서(SET NULL)
 * 계약은 자기가 연결을 잃은 줄 모른 채 남았고, 다음에 그 계약을 저장하는 순간
 * 시딩건이 또 새로 생겼다. 계약이 있는 건은 계약 탭에서 취소·삭제해야
 * 시딩건까지 한 번에 정리된다(linkSync 의 syncCampaign).
 */
export async function deleteCampaign(id: string): Promise<void> {
  await getSessionUserId();
  const supabase = await createClient();

  const { data: linked, error: linkErr } = await supabase
    .from("influencer_contracts")
    .select("id")
    .eq("campaign_id", id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (linkErr) throw linkErr;
  if (linked) {
    throw new Error(
      "이 시딩은 TMA 계약과 연결돼 있어요. 계약 탭에서 취소하거나 삭제해 주세요.",
    );
  }

  const { error } = await supabase.from("influencer_campaigns").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/dashboard/influencer");
  revalidatePath("/dashboard/influencer/schedule");
}

export async function updateCampaignMilestoneDate(
  campaign_id: string,
  kind: MilestoneKind,
  date_str: string,
): Promise<void> {
  if (!DATE_RE.test(date_str)) throw new Error("잘못된 날짜 형식입니다.");
  const column = MILESTONE_COLUMN[kind];
  if (!column) throw new Error("알 수 없는 일정 종류입니다.");

  const userId = await getSessionUserId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("influencer_campaigns")
    .update({ [column]: date_str, updated_at: new Date().toISOString() })
    .eq("id", campaign_id);

  if (error) throw error;
  // 계약에 대응하는 날짜(발송·초안·게시예정)만 옮긴다. DM/계약 진행일은 계약에 대응 항목이 없다.
  if (column === "ship_date" || column === "content_deadline" || column === "expected_post_date") {
    await syncContractFromCampaign(supabase, userId, campaign_id, { [column]: date_str });
  }
  revalidatePath("/dashboard/influencer");
}

// 인플루언서 라이트박스에서 게시물을 캠페인의 실제 결과 게시물로 연결.
// post_url + actual_post_date 채우고 status를 'posted'로 자동 전환.
export async function linkPostToCampaign(
  campaign_id: string,
  post_url: string,
  posted_at: string | null,
): Promise<InfluencerCampaign> {
  const userId = await getSessionUserId();
  const supabase = await createClient();

  // KST(Asia/Seoul) 기준 날짜로 저장한다.
  // toISOString() 은 UTC 기준이라 한국시간 오전 9시 이전에는 날짜가 하루 밀린다.
  const actualPostDate = posted_at
    ? toDateStringFromTimestamp(posted_at)
    : toDateString();

  const { data, error } = await supabase
    .from("influencer_campaigns")
    .update({
      post_url,
      actual_post_date: actualPostDate,
      status: "posted" as CampaignStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaign_id)
    .select()
    .single();

  if (error) throw error;
  // 계약 탭의 '실제 게시일'과 상태도 같이 채운다(예전엔 캠페인만 바뀌어 계약이 '—' 로 남았다)
  await syncContractFromCampaign(supabase, userId, campaign_id, {
    status: "posted",
    actual_post_date: actualPostDate,
  });
  revalidatePath("/dashboard/influencer");
  return data as InfluencerCampaign;
}
