// supabase/functions/influencer-analyze/index.ts
// Gemini API로 인플루언서 콘텐츠 분석 (Deno 네이티브)

import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// 환경 변수
// ============================================================
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing — Gemini 분석이 작동하지 않습니다");
}

// ============================================================
// Supabase 클라이언트 (service role)
// ============================================================
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// 타입
// ============================================================
interface GeminiInsights {
  category: string;
  persona: string;
  approach: string;
  fake_signal: string;
  summary: string;
}

interface InfluencerRow {
  id: string;
  username: string;
  bio: string | null;
  follower_count: number | null;
  engagement_rate: number | null;
}

interface PostRow {
  caption: string | null;
}

// ============================================================
// Gemini REST 호출
// ============================================================
async function callGemini(
  bio: string,
  captions: string[],
  followerCount: number,
  engagementRate: number,
): Promise<GeminiInsights> {
  const captionText = captions
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const prompt = `당신은 인플루언서 마케팅 전문가입니다. 아래 인스타그램 계정 정보를 분석해주세요.

[bio]
${bio || "(없음)"}

[최근 게시물 캡션 12개]
${captionText || "(없음)"}

[수치]
팔로워: ${followerCount}, ER: ${engagementRate}%

다음 JSON 형식으로 답변:
{
  "category": "뷰티" | "패션" | "IT" | "육아" | "푸드" | "여행" | "라이프스타일" | "운동/건강" | "기타",
  "persona": "주 타겟 페르소나 1줄 (예: '20대 후반 여성, 가성비 추구')",
  "approach": "협업 시 추천 어프로치 1줄 (예: '제품 사용 후기 위주, 진솔한 톤이 잘 맞음')",
  "fake_signal": "정상" | "의심: 사유 1줄",
  "summary": "이 인플루언서에 대한 한국어 종합 요약 1줄 (예: '이 인플루언서는 뷰티 카테고리에서 20대 여성을 타겟하며 진솔한 후기 스타일로 협업이 적합합니다')"
}`;

  const responseSchema = {
    type: "object",
    properties: {
      category: { type: "string" },
      persona: { type: "string" },
      approach: { type: "string" },
      fake_signal: { type: "string" },
      summary: { type: "string" },
    },
    required: ["category", "persona", "approach", "fake_signal", "summary"],
  };

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 오류 ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let parsed: GeminiInsights;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini 응답 JSON 파싱 실패: ${text}`);
  }

  return parsed;
}

// ============================================================
// sync_log 기록 (오류 추적용)
// ============================================================
async function logSyncError(influencerId: string, errorMessage: string) {
  await supabase.from("influencer_sync_logs").insert({
    influencer_id: influencerId,
    status: "ai_error",
    error_message: errorMessage,
  });
}

// ============================================================
// HTTP 진입점
// ============================================================
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Authorization 헤더 검증 (호출자 JWT)
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("unauthorized", { status: 401 });
  }

  // GEMINI_API_KEY 누락 시 명확한 에러
  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let influencerId: string;
  try {
    const json = await req.json();
    influencerId = json?.influencer_id;
    if (!influencerId) throw new Error("influencer_id 필드 없음");
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `요청 파싱 오류: ${(err as Error).message}` }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    // 1. 인플루언서 정보 조회
    const { data: influencer, error: infErr } = await supabase
      .from("influencers")
      .select("id, username, bio, follower_count, engagement_rate")
      .eq("id", influencerId)
      .single<InfluencerRow>();

    if (infErr || !influencer) {
      return new Response(
        JSON.stringify({ error: `인플루언서를 찾을 수 없습니다: ${influencerId}` }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    // 2. 최근 게시물 캡션 12개 조회
    const { data: posts } = await supabase
      .from("influencer_posts")
      .select("caption")
      .eq("influencer_id", influencerId)
      .order("posted_at", { ascending: false })
      .limit(12)
      .returns<PostRow[]>();

    const captions = (posts ?? [])
      .map((p) => (p.caption ?? "").slice(0, 500)) // 캡션당 최대 500자
      .filter((c) => c.length > 0);

    // 3. Gemini API 호출
    let insights: GeminiInsights;
    try {
      insights = await callGemini(
        influencer.bio ?? "",
        captions,
        influencer.follower_count ?? 0,
        influencer.engagement_rate ?? 0,
      );
    } catch (geminiErr) {
      const msg = (geminiErr as Error).message;
      await logSyncError(influencerId, msg);
      return new Response(
        JSON.stringify({ error: `Gemini 분석 실패: ${msg}` }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }

    // 4. influencers 업데이트
    const aiSummary = insights.summary || insights.approach;

    const { error: updateErr } = await supabase
      .from("influencers")
      .update({
        ai_insights: insights,
        ai_summary: aiSummary,
        category: insights.category,
        updated_at: new Date().toISOString(),
      })
      .eq("id", influencerId);

    if (updateErr) {
      throw new Error(`DB 업데이트 실패: ${updateErr.message}`);
    }

    return new Response(
      JSON.stringify({
        ai_summary: aiSummary,
        category: insights.category,
        ai_insights: insights,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    console.error("influencer-analyze error", err);
    return new Response(
      JSON.stringify({ error: `서버 오류: ${(err as Error).message}` }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
