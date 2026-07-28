// 게시물 URL 정규화 단위 테스트
// 시딩의 post_url 과 influencer_posts.post_url 을 맞추는 데 쓰인다.
// ⚠️ SQL 쪽 public.normalize_post_url() 과 규칙이 같아야 한다 (마이그 112).
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePostUrl } from "../src/lib/influencer/url.ts";

test("normalizePostUrl: 끝 슬래시·쿼리·www·대소문자·공백을 없앤다", () => {
  const expected = "https://instagram.com/p/ABC123";
  assert.equal(normalizePostUrl("https://www.instagram.com/p/ABC123/"), expected);
  assert.equal(normalizePostUrl("https://instagram.com/p/ABC123?igsh=xyz"), expected);
  assert.equal(normalizePostUrl("  https://WWW.Instagram.com/p/ABC123/  "), expected);
  assert.equal(normalizePostUrl("https://instagram.com/p/ABC123#comment"), expected);
});

test("normalizePostUrl: 빈 값은 null", () => {
  assert.equal(normalizePostUrl(null), null);
  assert.equal(normalizePostUrl(undefined), null);
  assert.equal(normalizePostUrl(""), null);
  assert.equal(normalizePostUrl("   "), null);
});

test("normalizePostUrl: 게시물 아이디 대소문자는 보존한다", () => {
  assert.notEqual(normalizePostUrl("https://instagram.com/p/AbC"), "https://instagram.com/p/abc");
  assert.equal(normalizePostUrl("https://instagram.com/p/AbC"), "https://instagram.com/p/AbC");
});

test("normalizePostUrl: 주소 형식이 아니면 null", () => {
  assert.equal(normalizePostUrl("그냥 글자"), null);
});

test("normalizePostUrl: 릴스 주소도 같은 규칙으로 다듬는다", () => {
  assert.equal(
    normalizePostUrl("https://www.instagram.com/reel/XYZ789/?utm_source=ig_web"),
    "https://instagram.com/reel/XYZ789"
  );
});
