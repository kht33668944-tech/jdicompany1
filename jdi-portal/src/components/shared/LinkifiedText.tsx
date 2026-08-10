/**
 * 사용자가 입력한 평문 텍스트에서 URL 을 찾아 클릭 가능한 링크로 바꿔 보여줍니다.
 * (예: 업무 타임라인 설명에 붙여넣은 노션 주소)
 *
 * 텍스트 자체는 그대로 두고 링크 부분만 <a> 로 감싸므로 줄바꿈(whitespace-pre-wrap)이 유지됩니다.
 */

const URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;
// 문장 끝에 붙은 마침표·괄호 등은 주소에서 떼어 냅니다.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"”’…]+$/;

type LinkifiedTextProps = {
  text: string;
  /** 감싸는 요소에 적용할 클래스 (기본 문단 스타일은 호출부에서 지정) */
  className?: string;
  /** 링크에 적용할 클래스 */
  linkClassName?: string;
};

const DEFAULT_LINK_CLASS =
  "font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500";

function toHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export default function LinkifiedText({ text, className, linkClassName }: LinkifiedTextProps) {
  const parts = text.split(URL_PATTERN);

  return (
    <p className={className}>
      {parts.map((part, index) => {
        // split 의 캡처 그룹 덕분에 홀수 인덱스가 URL 후보입니다.
        if (index % 2 === 0 || !part) {
          return part;
        }

        const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
        const url = trailing ? part.slice(0, part.length - trailing.length) : part;

        if (!url) {
          return part;
        }

        return (
          <span key={`${index}-${url}`}>
            <a
              href={toHref(url)}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={linkClassName ?? DEFAULT_LINK_CLASS}
            >
              {url}
            </a>
            {trailing}
          </span>
        );
      })}
    </p>
  );
}
