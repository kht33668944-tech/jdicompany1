"use client";

// 정산 정보(개인정보) 입력/수정 모달 — 2차 비밀번호 잠금 해제 상태에서만 열린다.
// 신분증 파일은 브라우저에서 비공개 버킷에 올린 뒤 경로만 서버 액션으로 저장한다.

import { useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import { getErrorMessage } from "@/lib/utils/errors";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import { upsertSettlement } from "@/lib/influencer/contracts/actions";
import { removeIdCardFile, uploadIdCardFile } from "@/lib/influencer/contracts/storage";
import type { ContractSettlement, InfluencerContract } from "@/lib/influencer/contracts/types";

interface Props {
  contract: InfluencerContract;
  settlement: ContractSettlement | null;
  onClose: () => void;
  onSaved: () => void;
}

// 모달 폼 공용 클래스 — 보관함 모달과 동일 스타일(단일 소스)
const inputCls = MODAL_INPUT_CLS;
const labelCls = MODAL_LABEL_CLS;

export default function SettlementFormModal({ contract, settlement, onClose, onSaved }: Props) {
  const [phone, setPhone] = useState(settlement?.phone ?? "");
  const [address, setAddress] = useState(settlement?.address ?? "");
  const [bankName, setBankName] = useState(settlement?.bank_name ?? "");
  const [bankAccount, setBankAccount] = useState(settlement?.bank_account ?? "");
  const [accountHolder, setAccountHolder] = useState(settlement?.account_holder ?? "");
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      let idCardPath = settlement?.id_card_path ?? null;
      let idCardName = settlement?.id_card_name ?? null;
      if (idCardFile) {
        const uploaded = await uploadIdCardFile(contract.id, idCardFile);
        uploadedPath = uploaded.storagePath;
        idCardPath = uploaded.storagePath;
        idCardName = uploaded.fileName;
      }
      await upsertSettlement(contract.id, {
        phone,
        address,
        bank_name: bankName,
        bank_account: bankAccount,
        account_holder: accountHolder,
        id_card_path: idCardPath,
        id_card_name: idCardName,
      });
      toast.success("정산 정보가 저장되었습니다.");
      onSaved();
    } catch (err) {
      // 서버 저장 실패 시 방금 올린 파일은 고아가 되지 않게 정리
      if (uploadedPath) await removeIdCardFile(uploadedPath);
      toast.error(getErrorMessage(err, "정산 정보 저장 실패"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-md">
      <h2 className="mb-1 text-base font-extrabold text-slate-800">정산 정보 {settlement ? "수정" : "입력"}</h2>
      <p className="mb-4 text-xs text-slate-400">
        {contract.name} · 저장된 내용은 암호화되며, 열람하려면 2차 비밀번호가 필요해요.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="settlement-phone" className={labelCls}>휴대폰 번호</label>
            <input
              id="settlement-phone"
              type="text"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="settlement-holder" className={labelCls}>예금주</label>
            <input
              id="settlement-holder"
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              placeholder="정산 계좌 예금주명"
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label htmlFor="settlement-address" className={labelCls}>배송지 주소</label>
          <input
            id="settlement-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="제품을 받을 집주소"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="settlement-bank" className={labelCls}>은행</label>
            <input
              id="settlement-bank"
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="예: 국민은행"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="settlement-account" className={labelCls}>계좌번호</label>
            <input
              id="settlement-account"
              type="text"
              inputMode="numeric"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
              placeholder="숫자와 - 만"
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label htmlFor="settlement-idcard" className={labelCls}>
            신분증 사진 <span className="font-normal text-slate-400">(이미지·PDF, 10MB 이하)</span>
          </label>
          {settlement?.id_card_path && !idCardFile && (
            <p className="mb-1.5 ml-1 text-xs text-slate-500">
              현재 파일: <b>{settlement.id_card_name ?? "신분증 파일"}</b> — 새 파일을 올리면 교체돼요.
            </p>
          )}
          <input
            id="settlement-idcard"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setIdCardFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-xl bg-[#2563eb] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </ModalContainer>
  );
}
