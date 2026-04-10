"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WifiHigh } from "phosphor-react";
import {
  approveIpChangeRequest,
  rejectIpChangeRequest,
} from "@/lib/settings/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import type { IpChangeRequest } from "@/lib/attendance/types";

interface Props {
  requests: IpChangeRequest[];
}

export default function AdminIpChangeRequests({ requests }: Props) {
  const router = useRouter();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await approveIpChangeRequest(id);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, "승인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await rejectIpChangeRequest(id, reason);
      setRejectingId(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, "반려에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <WifiHigh size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">출퇴근 IP 변경 요청</h3>
        {requests.length > 0 && (
          <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {requests.length}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">대기 중인 변경 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => (
            <li key={req.id} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  {req.profiles?.full_name ?? "—"}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  현재: {req.profiles?.allowed_ip ?? "미설정"}
                </span>
              </div>
              <div className="text-sm text-slate-700 mb-1">
                요청 IP: <span className="font-semibold font-mono">{req.requested_ip}</span>
              </div>
              {req.reason && (
                <p className="text-xs text-slate-500 mb-2">사유: {req.reason}</p>
              )}
              {rejectingId === req.id ? (
                <div className="flex gap-2 mt-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="반려 사유"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-slate-200"
                  />
                  <button onClick={() => handleReject(req.id)} disabled={loading || !reason.trim()}
                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg disabled:opacity-40">확인</button>
                  <button onClick={() => { setRejectingId(null); setReason(""); }}
                    className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg">취소</button>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleApprove(req.id)} disabled={loading}
                    className="flex-1 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 disabled:opacity-40">승인</button>
                  <button onClick={() => setRejectingId(req.id)} disabled={loading}
                    className="flex-1 py-2 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-40">반려</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
