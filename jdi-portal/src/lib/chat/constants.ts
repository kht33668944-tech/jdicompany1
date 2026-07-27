import type { ChannelType, MessageType } from "./types";

export const MESSAGES_PER_PAGE = 30;

/** 채팅 첨부 버킷 */
export const CHAT_BUCKET = "chat-attachments";

/** 채팅 첨부 서명 URL 유효시간(초). 서버 프리페치와 클라이언트 배치가 같은 값을 쓴다. */
export const CHAT_FILE_URL_TTL_SECONDS = 3600;

export const CHANNEL_TYPE_CONFIG: Record<ChannelType, { label: string }> = {
  group: { label: "그룹 채널" },
  memo: { label: "나만의 메모" },
  dm: { label: "1:1 대화" },
};

export const MESSAGE_TYPE_CONFIG: Record<MessageType, { label: string }> = {
  text: { label: "텍스트" },
  file: { label: "파일" },
  image: { label: "이미지" },
  system: { label: "시스템" },
};
