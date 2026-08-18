"use client";

// 계약서 문서형 편집기 — 한 장의 A4 문서 위에서 워드처럼 쓰고 고친다.
//
//  · 아무 데나 커서를 놓고 타이핑, 엔터로 문단/조항 추가
//  · 채움 칸(필드)은 글자 사이에 끼워 넣는 인라인 칩 — 클릭하면 설정 팝오버
//  · 붙여넣기하면 "제N조"를 알아보고 우리 양식(조항 구조)으로 바꿔서 넣는다
//
// 저장 형태는 기존 ContentV2 그대로다(richdoc.ts 가 변환) — PDF·서명 페이지 무수정.
// ⚠️ 무거운 라이브러리(TipTap)를 쓰므로 반드시 dynamic(ssr:false) 로만 불러야 한다.
//    (초기 JS 예산 보호 — scripts/company-contracts.test.mjs 가 고정)

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { parseContractText } from "@/lib/contracts/parse";
import {
  CLAUSE_NO_RE,
  contentToDoc,
  docToContent,
  FIELD_CHIP_NODE,
  TERMS_BLOCK_NODE,
  renumberHeading,
  type RichDoc,
} from "@/lib/contracts/richdoc";
import {
  FIELD_TYPE_LABEL,
  PARTY_PRESETS,
  STAFF_PRESETS,
  type FieldPreset,
} from "@/lib/contracts/fieldPresets";
import { findFieldChip, scrollToFieldChip } from "@/lib/contracts/chipFlash";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import type {
  ContentV2,
  CreateFieldInput,
  FieldDef,
  FieldType,
  TermRow,
} from "@/lib/contracts/types";

// ============================================================
// 칩·조건표 노드뷰가 최신 데이터를 보도록 하는 통로
// ============================================================
interface EditorShared {
  fields: FieldDef[];
  terms: TermRow[];
  onTermsChange: (rows: TermRow[]) => void;
  /** 조건표를 여기서 채우지 않고 "자리만" 잡는 경우(TMA 양식) — 안내만 보여준다 */
  termsPlaceholder: boolean;
}
const SharedContext = createContext<EditorShared>({
  fields: [],
  terms: [],
  onTermsChange: () => {},
  termsPlaceholder: false,
});

// ============================================================
// 채움 칸 칩 (인라인, 통째로 하나의 글자처럼 다뤄진다)
// ============================================================
function FieldChipView({ node }: ReactNodeViewProps) {
  const { fields } = useContext(SharedContext);
  const key = String(node.attrs.fieldKey ?? "");
  const def = fields.find((f) => f.key === key);

  if (!def) {
    return (
      <NodeViewWrapper
        as="span"
        data-field-key={key}
        className="mx-0.5 inline-block cursor-pointer rounded-md border border-dashed border-rose-300 bg-rose-50 px-1.5 align-baseline text-[12px] font-bold text-rose-500"
      >
        삭제된 칸
      </NodeViewWrapper>
    );
  }
  const staffValue = def.kind === "staff" ? def.value?.trim() : "";
  return (
    <NodeViewWrapper
      as="span"
      data-field-key={key}
      className={`mx-0.5 inline-block cursor-pointer rounded-md border border-dashed px-1.5 align-baseline text-[12px] font-bold ${
        def.kind === "staff"
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : "border-amber-300 bg-amber-50 text-amber-700"
      }`}
      title={`${def.kind === "staff" ? "우리가 채우는 칸" : "상대방이 채우는 칸"} — 눌러서 설정`}
    >
      {def.kind === "staff" ? staffValue || def.label : def.label}
    </NodeViewWrapper>
  );
}

const FieldChip = Node.create({
  name: FIELD_CHIP_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { fieldKey: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-field-key]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-field-key": HTMLAttributes.fieldKey })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FieldChipView);
  },
});

// ============================================================
// 조건표 블록 (문서 흐름 안에 놓이는 표)
// ============================================================
const TERM_INPUT_CLS =
  "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[12.5px] text-slate-800 focus:border-blue-400 focus:outline-none";

function TermsBlockView() {
  const { terms, onTermsChange, termsPlaceholder } = useContext(SharedContext);

  const setRow = (index: number, patch: Partial<TermRow>) =>
    onTermsChange(terms.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  // 양식 편집(TMA) — 내용은 계약서를 만들 때 채워지므로 자리만 표시한다
  if (termsPlaceholder) {
    return (
      <NodeViewWrapper
        contentEditable={false}
        className="my-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3"
      >
        <p className="text-[12.5px] font-bold text-slate-500">▦ 개별 조건표 자리</p>
        <p className="mt-0.5 text-[11.5px] text-slate-400">
          계약서를 만들 때 이 자리에 조건표(표)가 자동으로 들어가요. 내용은 계약 건마다 채웁니다.
        </p>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
      className="my-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
    >
      <p className="mb-2 text-[11.5px] font-bold text-slate-400">
        개별 조건표 — 계약서에 표로 인쇄돼요
      </p>
      <div className="space-y-1.5">
        {terms.map((term, i) => (
          <div key={i} className="grid grid-cols-[92px_112px_1fr_auto] items-center gap-1.5">
            <input
              className={TERM_INPUT_CLS}
              value={term.section}
              onChange={(e) => setRow(i, { section: e.target.value })}
              placeholder="항목"
            />
            <input
              className={TERM_INPUT_CLS}
              value={term.label}
              onChange={(e) => setRow(i, { label: e.target.value })}
              placeholder="이름"
            />
            <input
              className={TERM_INPUT_CLS}
              value={term.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              placeholder="내용"
            />
            <button
              type="button"
              disabled={terms.length <= 1}
              onClick={() => onTermsChange(terms.filter((_, idx) => idx !== i))}
              className="px-1 text-[12px] font-semibold text-slate-400 hover:text-rose-500 disabled:opacity-30"
              aria-label="행 삭제"
              title={terms.length <= 1 ? "마지막 행은 지울 수 없어요" : "행 삭제"}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onTermsChange([
            ...terms,
            { section: terms[terms.length - 1]?.section ?? "기본 조건", label: "", value: "" },
          ])
        }
        className="mt-2 text-[12px] font-bold text-blue-600 hover:text-blue-700"
      >
        ＋ 행 추가
      </button>
    </NodeViewWrapper>
  );
}

const TermsBlock = Node.create({
  name: TERMS_BLOCK_NODE,
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-terms-block]" }];
  },
  renderHTML() {
    return ["div", { "data-terms-block": "true" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TermsBlockView);
  },
});

// ============================================================
// 편집기 본체
// ============================================================
interface Props {
  /** 처음 한 번만 사용 — 이후에는 편집기가 문서를 소유한다 */
  initialContent: ContentV2;
  fields: FieldDef[];
  terms: TermRow[];
  onTermsChange: (rows: TermRow[]) => void;
  onDocChange: (partial: Pick<ContentV2, "title" | "intro" | "clauses">) => void;
  onCreateField: (input: CreateFieldInput) => FieldDef | null;
  onUpdateField: (key: string, patch: Partial<FieldDef>) => void;
  /** 삭제 가능 여부는 부모가 판단(본문에서 쓰이는 칸은 거절) */
  onDeleteField: (key: string) => void;
  /** 왼쪽 목록에서 칸을 눌렀을 때 문서에서 찾아 강조 */
  highlightFieldKey: string | null;
  onHighlightHandled: () => void;
  /**
   * 무엇을 편집하는가 — 하나의 사실에서 화면 차이가 모두 따라 나온다.
   *
   *  · doc      (기본): 계약서 1부. 채움 칸을 꽂고 조건표 값을 채운다.
   *  · tmaTemplate: 인플루언서(TMA) 양식. 값은 계약 건마다 채우므로 칸을 심지 않고
   *    조건표는 자리만 잡는다. 굵게도 끈다 — TMA 렌더러는 `**굵게**` 표기를 해석하지
   *    않아 계약서에 별표가 그대로 찍힌다(계약관리 쪽만 해석한다).
   */
  variant?: "doc" | "tmaTemplate";
}

const TOOL_BTN =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40";
const TOOL_BTN_ON =
  "rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[12.5px] font-bold text-blue-700";

export default function ContractRichEditor({
  initialContent,
  fields,
  terms,
  onTermsChange,
  onDocChange,
  onCreateField,
  onUpdateField,
  onDeleteField,
  highlightFieldKey,
  onHighlightHandled,
  variant = "doc",
}: Props) {
  const isTemplate = variant === "tmaTemplate";
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [popover, setPopover] = useState<{ key: string; left: number; top: number } | null>(null);
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  // 메뉴·팝오버는 화면을 덮는 투명 레이어로 닫으면 안 된다 — 레이어가 클릭을 삼켜서
  // "메뉴를 연 채 문서의 다른 자리를 눌러 커서를 옮기는" 동작이 먹히지 않는다.
  // 그러면 커서가 직전 자리에 남아 다음 칸이 엉뚱한 곳에 들어간다(실제 발생).
  // 공용 훅은 이벤트를 막지 않으므로 같은 클릭이 문서까지 그대로 전달된다.
  const closeFieldMenu = useCallback(() => setFieldMenuOpen(false), []);
  const closePopover = useCallback(() => setPopover(null), []);
  const fieldMenuRef = useClickOutside<HTMLDivElement>(closeFieldMenu, {
    enabled: fieldMenuOpen,
    capture: true,
  });
  const popoverRef = useClickOutside<HTMLDivElement>(closePopover, {
    enabled: Boolean(popover),
    capture: true,
  });

  const shared = useMemo<EditorShared>(
    () => ({ fields, terms, onTermsChange, termsPlaceholder: isTemplate }),
    [fields, terms, onTermsChange, isTemplate],
  );

  const emit = useCallback((e: Editor) => {
    const doc = e.getJSON() as unknown as RichDoc;
    const next = docToContent(doc, initialContent);
    onDocChangeRef.current({ title: next.title, intro: next.intro, clauses: next.clauses });
    // initialContent 는 변환 시 base 로만 쓰이고 결과에서 세 값만 취한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [initialDoc] = useState(
    () => contentToDoc(initialContent) as unknown as Record<string, unknown>,
  );

  const editor = useEditor({
    immediatelyRender: false, // 지연 로드 컴포넌트라 SSR 렌더를 하지 않는다
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        strike: false,
        italic: false,
        underline: false,
        link: false,
        hardBreak: false,
        // TMA 양식은 굵게를 저장할 방법이 없다(그쪽 렌더러가 `**` 를 그대로 인쇄한다)
        ...(isTemplate ? { bold: false as const } : {}),
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading" && node.attrs.level === 1
            ? "계약서 제목 (예: 용역 계약서)"
            : "내용을 입력하거나, 워드에서 복사한 계약서를 붙여넣으세요",
        showOnlyWhenEditable: true,
      }),
      FieldChip,
      TermsBlock,
    ],
    // 처음 한 번만 쓰인다 — 매 렌더(=타이핑마다) 문서 전체를 다시 변환하지 않도록 지연 계산
    content: initialDoc,
    editorProps: {
      attributes: {
        class: "contract-doc min-h-[520px] px-[52px] py-[56px] focus:outline-none",
      },
      // 붙여넣기 → "제N조" 를 알아보고 우리 양식(조항 구조)으로 변환해 넣는다
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (!text.trim() || !text.includes("\n")) return false;

        const parsed = parseContractText(text);
        const hasHeadings = parsed.clauses.some((c) => c.heading);
        const { schema } = view.state;
        const nodes: PMNode[] = [];
        const lines = (block: string) =>
          block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const para = (line: string) => schema.node("paragraph", null, [schema.text(line)]);

        // 아직 아무것도 안 쓴 문서면 통째로 갈아끼운다 —
        // "워드 계약서를 붙여넣으면 우리 양식으로 바뀐다"가 이 기능의 핵심이라
        // 처음 만들 때 남아 있던 기본 조항이 앞에 끼어 중복되면 안 된다.
        let titleText = "";
        let hasBodyText = false;
        view.state.doc.forEach((node) => {
          if (node.type.name === "heading" && node.attrs.level === 1) {
            titleText = node.textContent.trim();
          } else if (node.type.name === "paragraph" && node.textContent.trim()) {
            hasBodyText = true;
          }
        });
        const blankDoc = !titleText && !hasBodyText;

        const introLines = lines(parsed.intro);
        // 빈 문서라면 첫 줄(짧으면)을 계약서 제목으로 올린다 — 보통 "용역 계약서" 같은 줄
        const titleLine =
          blankDoc && introLines.length > 0 && introLines[0].length <= 40
            ? (introLines.shift() as string)
            : "";
        if (blankDoc) {
          nodes.push(
            schema.node("heading", { level: 1 }, titleLine ? [schema.text(titleLine)] : []),
          );
        }

        if (hasHeadings) {
          for (const line of introLines) nodes.push(para(line));
          for (const clause of parsed.clauses) {
            if (clause.heading) {
              nodes.push(schema.node("heading", { level: 2 }, [schema.text(clause.heading)]));
            }
            for (const line of lines(clause.body)) nodes.push(para(line));
          }
        } else {
          for (const line of lines(text)) nodes.push(para(line));
        }
        if (nodes.length === 0) return false;

        if (blankDoc) {
          const tr = view.state.tr.replaceWith(
            0,
            view.state.doc.content.size,
            Fragment.fromArray(nodes),
          );
          view.dispatch(tr.scrollIntoView());
        } else {
          const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        }
        return true;
      },
    },
    onUpdate: ({ editor: e }) => emit(e),
    onSelectionUpdate: ({ editor: e }) => {
      const sel = e.state.selection;
      if (sel instanceof NodeSelection && sel.node.type.name === FIELD_CHIP_NODE) {
        const key = sel.node.attrs.fieldKey as string;
        const coords = e.view.coordsAtPos(sel.from);
        setPopover({ key, left: coords.left, top: coords.bottom + 6 });
      } else {
        setPopover(null);
      }
    },
  });

  // 왼쪽 목록에서 칸을 눌렀을 때 — 문서에서 찾아 스크롤하고 잠깐 깜빡인다
  useEffect(() => {
    if (!highlightFieldKey || !editor) return;
    const el = findFieldChip(editor.view.dom, highlightFieldKey);
    if (el) scrollToFieldChip(el);
    onHighlightHandled();
  }, [highlightFieldKey, editor, onHighlightHandled]);

  if (!editor) {
    return (
      <div className="min-h-[520px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
    );
  }

  const insertField = (def: FieldDef) => {
    editor
      .chain()
      .focus()
      .insertContent({ type: FIELD_CHIP_NODE, attrs: { fieldKey: def.key } })
      .run();
    setFieldMenuOpen(false);
  };

  const createAndInsert = (input: CreateFieldInput) => {
    const def = onCreateField(input);
    if (def) insertField(def);
  };

  const addPreset = (preset: FieldPreset) =>
    createAndInsert({ kind: preset.kind, label: preset.label, type: preset.type });

  /** "제N조" 로 시작하는 조항 제목만 순서대로 번호를 다시 매긴다 */
  const renumberClauses = () => {
    const { state } = editor;
    const edits: { from: number; to: number; text: string }[] = [];
    let order = 0;
    state.doc.descendants((node, pos) => {
      if (node.type.name === "heading" && node.attrs.level === 2) {
        const text = node.textContent;
        if (CLAUSE_NO_RE.test(text.trim())) {
          order += 1;
          const next = renumberHeading(text, order);
          if (next !== text) {
            edits.push({ from: pos + 1, to: pos + 1 + node.content.size, text: next });
          }
        }
      }
      return true;
    });
    if (edits.length === 0) {
      return;
    }
    const tr = state.tr;
    // 뒤에서부터 바꿔야 앞 위치가 밀리지 않는다
    for (const e of edits.reverse()) tr.replaceWith(e.from, e.to, state.schema.text(e.text));
    editor.view.dispatch(tr);
  };

  const hasTerms =
    (editor.getJSON().content ?? []).some((n) => n.type === TERMS_BLOCK_NODE) ?? false;
  const popoverField = popover ? fields.find((f) => f.key === popover.key) : null;

  return (
    <SharedContext.Provider value={shared}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 툴바 —
            mousedown 의 기본 동작(포커스 이동)을 막아 편집기에서 포커스가 빠지지 않게 한다.
            버튼을 눌러도 문서에 커서가 그대로 깜빡여, 어디에 칸이 들어갈지 보이고
            누른 뒤 바로 이어서 타이핑할 수 있다.
            ⚠️ 툴바 안에는 버튼만 둘 것 — 입력칸을 넣으면 이 처리 때문에 글자를 칠 수 없다. */}
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2"
        >
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive("heading", { level: 2 }) ? TOOL_BTN_ON : TOOL_BTN}
            title="이 줄을 조항 제목으로 (제1조 …)"
          >
            조항 제목
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={editor.isActive("paragraph") ? TOOL_BTN_ON : TOOL_BTN}
          >
            본문
          </button>
          {!isTemplate && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive("bold") ? TOOL_BTN_ON : TOOL_BTN}
              title="굵게"
            >
              <b>가</b>
            </button>
          )}

          {!isTemplate && <span className="mx-1 h-4 w-px bg-slate-200" />}

          {/* 칸 넣기 — 양식 편집에서는 아예 만들지 않는다(열 수 없는 메뉴를 DOM 에 남기지 않게) */}
          {!isTemplate && (
          <div className="relative" ref={fieldMenuRef}>
            <button
              type="button"
              onClick={() => setFieldMenuOpen((v) => !v)}
              className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[12.5px] font-bold text-blue-700 hover:bg-blue-100"
            >
              ＋ 칸 넣기 ▾
            </button>
            {fieldMenuOpen && (
              <>
                <div className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <p className="px-2 py-1 text-[11px] font-bold text-amber-600">
                    🟡 상대방이 채우는 칸 — 자주 쓰는 것
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {PARTY_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => addPreset(p)}
                        className="rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-amber-50"
                      >
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 border-t border-slate-100 px-2 pt-2 text-[11px] font-bold text-blue-600">
                    🔵 우리가 채우는 칸 — 자주 쓰는 것
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {STAFF_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => addPreset(p)}
                        className="rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold text-slate-700 hover:bg-blue-50"
                      >
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 border-t border-slate-100 px-2 pt-2 text-[11px] font-bold text-slate-400">
                    직접 만들기
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      createAndInsert({ kind: "staff", label: "새 칸", type: "text" })
                    }
                    className="w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    🔵 우리가 채우는 빈 칸
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      createAndInsert({ kind: "party", label: "새 칸", type: "text" })
                    }
                    className="w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold text-amber-700 hover:bg-amber-50"
                  >
                    🟡 상대방이 채우는 빈 칸
                  </button>
                  {fields.length > 0 && (
                    <>
                      <p className="mt-1.5 border-t border-slate-100 px-2 pt-2 text-[11px] font-bold text-slate-400">
                        이미 만든 칸 다시 넣기
                      </p>
                      {fields.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => insertField(f)}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-slate-50"
                        >
                          <span className={f.kind === "staff" ? "text-blue-500" : "text-amber-500"}>
                            ●
                          </span>
                          <span className="truncate text-slate-700">{f.label || f.key}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          )}

          <button
            type="button"
            disabled={hasTerms}
            onClick={() => {
              if (terms.length === 0) onTermsChange([{ section: "기본 조건", label: "", value: "" }]);
              editor.chain().focus().insertContent({ type: TERMS_BLOCK_NODE }).run();
            }}
            className={TOOL_BTN}
            title={hasTerms ? "이미 조건표가 있어요" : "조건표 표를 넣어요"}
          >
            ▦ 조건표
          </button>

          <span className="mx-1 h-4 w-px bg-slate-200" />

          <button type="button" onClick={renumberClauses} className={TOOL_BTN} title="제1조·제2조… 순서대로 다시 매깁니다">
            조항 번호 정리
          </button>

          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className={TOOL_BTN}
              title="되돌리기"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className={TOOL_BTN}
              title="다시하기"
            >
              ↷
            </button>
          </span>
        </div>

        {/* A4 문서 */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 px-4 py-6">
          <div className="mx-auto w-full max-w-[794px] rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)]">
            <EditorContent editor={editor} />
            {/* 서명란은 발송 시 자동으로 붙는다 — 편집 대상이 아님을 보여준다 */}
            <div className="mx-[52px] mb-[56px] rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-4">
              <p className="text-[11.5px] font-bold text-slate-400">
                아래 서명란은 계약서에 자동으로 붙습니다 (편집하지 않아도 돼요)
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 text-[12px] text-slate-500">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <b className="text-slate-600">갑 · 우리 회사</b>
                  <p className="mt-0.5">상호·대표자·주소·담당자 + 회사 도장 자동 날인</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <b className="text-slate-600">을 · 상대방</b>
                  <p className="mt-0.5">서명 시 입력한 정보 + 손서명 또는 법인 도장</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 칩 설정 팝오버 — 닫기도 위 메뉴와 같은 이유로 덮개를 쓰지 않는다 */}
      {popover && popoverField && (
        <>
          <div
            ref={popoverRef}
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
            style={{ left: Math.min(popover.left, window.innerWidth - 280), top: popover.top }}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
                  popoverField.kind === "staff"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {popoverField.kind === "staff" ? "우리가 채움" : "상대방 입력"}
              </span>
              <button
                type="button"
                onClick={() => {
                  onDeleteField(popoverField.key);
                  setPopover(null);
                }}
                className="ml-auto text-[11.5px] font-semibold text-slate-400 hover:text-rose-500"
              >
                칸 삭제
              </button>
            </div>
            <label className="mb-1 block text-[11px] font-bold text-slate-400">칸 이름</label>
            <input
              autoFocus
              value={popoverField.label}
              onChange={(e) => onUpdateField(popoverField.key, { label: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none"
            />
            <label className="mb-1 mt-2 block text-[11px] font-bold text-slate-400">입력 종류</label>
            <select
              value={popoverField.type}
              onChange={(e) =>
                onUpdateField(popoverField.key, { type: e.target.value as FieldType })
              }
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none"
            >
              {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {popoverField.type === "select" && (
              <>
                <label className="mb-1 mt-2 block text-[11px] font-bold text-slate-400">
                  고를 보기 (한 줄에 하나)
                </label>
                <textarea
                  value={(popoverField.options ?? []).join("\n")}
                  onChange={(e) =>
                    onUpdateField(popoverField.key, {
                      // 빈 줄은 저장할 때 서버가 걸러낸다(actions.ts validateOptions)
                      options: e.target.value.split("\n"),
                    })
                  }
                  placeholder={"CJ대한통운\n한진택배\n롯데택배"}
                  className="min-h-[76px] w-full resize-y rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] leading-relaxed text-slate-800 focus:border-blue-400 focus:outline-none"
                />
              </>
            )}
            {popoverField.kind === "party" && (
              <label className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={popoverField.required}
                  onChange={(e) =>
                    onUpdateField(popoverField.key, { required: e.target.checked })
                  }
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                꼭 입력해야 하는 칸
              </label>
            )}
            {popoverField.kind === "staff" && (
              <>
                <label className="mb-1 mt-2 block text-[11px] font-bold text-slate-400">값</label>
                <input
                  value={popoverField.value ?? ""}
                  onChange={(e) => onUpdateField(popoverField.key, { value: e.target.value })}
                  placeholder="발송 전에 채워주세요"
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none"
                />
              </>
            )}
          </div>
        </>
      )}
    </SharedContext.Provider>
  );
}
