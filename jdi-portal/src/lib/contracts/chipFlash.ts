// 문서 안의 채움 칸을 찾아 화면으로 옮기고 잠깐 깜빡이게 한다.
// 편집기(왼쪽 목록에서 칸 누르기)와 서명 페이지(「다음 칸」)가 함께 쓴다.
//
// 깜빡임은 globals.css 의 .chip-flash 애니메이션이다 — 지속 시간이 바뀌면 아래 상수도 함께 고친다.

const FLASH_MS = 2400;

/** data-field-key 로 칸 요소를 찾는다 */
export function findFieldChip(root: ParentNode, key: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-field-key="${key}"]`);
}

/** 화면 가운데로 옮기고 잠깐 깜빡인다 */
export function scrollToFieldChip(el: HTMLElement, block: ScrollLogicalPosition = "center") {
  el.scrollIntoView({ behavior: "smooth", block });
  el.classList.add("chip-flash");
  window.setTimeout(() => el.classList.remove("chip-flash"), FLASH_MS);
}

/** 문서에 그려진 순서(= 읽는 순서)대로 칸 key 를 모은다 */
export function fieldKeysInDocOrder(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-field-key]")]
    .map((el) => el.dataset.fieldKey)
    .filter((k): k is string => Boolean(k));
}
