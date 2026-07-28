"use client";

import { useState } from "react";
import { toast } from "sonner";
import PencilSimple from "phosphor-react/dist/icons/PencilSimple.esm.js";
import { upsertInfluencerContact } from "@/lib/influencer/contact-actions";
import {
  EMPTY_CONTACT_INPUT,
  type InfluencerContact,
  type InfluencerContactInput,
} from "@/lib/influencer/contact-types";

interface Props {
  influencerId: string;
  contact: InfluencerContact | null;
  onSaved: (input: InfluencerContactInput) => void;
}

const INPUT_CLS =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function toInput(contact: InfluencerContact | null): InfluencerContactInput {
  if (!contact) return { ...EMPTY_CONTACT_INPUT };
  return {
    recipient_name: contact.recipient_name,
    phone: contact.phone,
    postcode: contact.postcode,
    address1: contact.address1,
    address2: contact.address2,
    email: contact.email,
    bank_name: contact.bank_name,
    account_number: contact.account_number,
    account_holder: contact.account_holder,
    note: contact.note,
  };
}

/** 읽기 모드의 한 줄. 값이 없으면 회색 "없음". */
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-16 shrink-0 text-slate-400">{label}</span>
      {value ? (
        <span className="text-slate-700 break-all">{value}</span>
      ) : (
        <span className="text-slate-300">없음</span>
      )}
    </div>
  );
}

export default function InfluencerContactSection({ influencerId, contact, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<InfluencerContactInput>(() => toInput(contact));

  const set = (key: keyof InfluencerContactInput) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const startEdit = () => {
    setForm(toInput(contact));
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertInfluencerContact(influencerId, form);
      onSaved(form);
      setEditing(false);
      toast.success("연락처를 저장했습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "연락처 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const fullAddress = [contact?.postcode, contact?.address1, contact?.address2]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          배송·정산 정보
        </h4>
        {!editing && (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            <PencilSimple size={13} weight="bold" />
            수정
          </button>
        )}
      </div>

      {editing ? (
        <div className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
          <div className="grid grid-cols-2 gap-2">
            <input
              className={INPUT_CLS}
              placeholder="받는사람"
              value={form.recipient_name ?? ""}
              onChange={(e) => set("recipient_name")(e.target.value)}
            />
            <input
              className={INPUT_CLS}
              placeholder="전화번호"
              value={form.phone ?? ""}
              onChange={(e) => set("phone")(e.target.value)}
            />
          </div>
          <input
            className={INPUT_CLS}
            placeholder="우편번호"
            value={form.postcode ?? ""}
            onChange={(e) => set("postcode")(e.target.value)}
          />
          <input
            className={INPUT_CLS}
            placeholder="주소"
            value={form.address1 ?? ""}
            onChange={(e) => set("address1")(e.target.value)}
          />
          <input
            className={INPUT_CLS}
            placeholder="상세 주소"
            value={form.address2 ?? ""}
            onChange={(e) => set("address2")(e.target.value)}
          />
          <input
            className={INPUT_CLS}
            placeholder="이메일"
            value={form.email ?? ""}
            onChange={(e) => set("email")(e.target.value)}
          />

          <div className="pt-1 text-[11px] font-semibold text-slate-400">정산</div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className={INPUT_CLS}
              placeholder="은행"
              value={form.bank_name ?? ""}
              onChange={(e) => set("bank_name")(e.target.value)}
            />
            <input
              className={INPUT_CLS}
              placeholder="예금주"
              value={form.account_holder ?? ""}
              onChange={(e) => set("account_holder")(e.target.value)}
            />
          </div>
          <input
            className={INPUT_CLS}
            placeholder="계좌번호"
            value={form.account_number ?? ""}
            onChange={(e) => set("account_number")(e.target.value)}
          />
          <input
            className={INPUT_CLS}
            placeholder="메모"
            value={form.note ?? ""}
            onChange={(e) => set("note")(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 border border-slate-100">
          <Row label="받는사람" value={contact?.recipient_name ?? null} />
          <Row label="전화" value={contact?.phone ?? null} />
          <Row label="주소" value={fullAddress || null} />
          <Row label="이메일" value={contact?.email ?? null} />
          <div className="pt-1.5 mt-1.5 border-t border-slate-200/70 space-y-1.5">
            <Row label="은행" value={contact?.bank_name ?? null} />
            <Row label="계좌" value={contact?.account_number ?? null} />
            <Row label="예금주" value={contact?.account_holder ?? null} />
          </div>
          {contact?.note && <Row label="메모" value={contact.note} />}
        </div>
      )}
    </div>
  );
}
