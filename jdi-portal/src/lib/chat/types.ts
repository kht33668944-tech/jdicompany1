export type ChannelType = "group" | "memo";
export type MessageType = "text" | "file" | "image" | "system";
export type ChannelMemberRole = "owner" | "member";

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: ChannelMemberRole;
  last_read_at: string;
  joined_at: string;
  profile?: { full_name: string; avatar_url: string | null };
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  type: MessageType;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
  pinned_by?: string | null;
  pinned_at?: string | null;
  parent_message_id: string | null;
  created_at: string;
  updated_at: string;
  user_profile?: { full_name: string; avatar_url: string | null };
  attachments?: MessageAttachment[];
  read_by?: MessageReadReceipt[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
}

export interface MessageReadReceipt {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  read_at: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reacted: boolean; // current user reacted with this emoji
}

export interface ChannelWithDetails extends Channel {
  members: ChannelMember[];
  member_count: number;
  last_message: {
    content: string;
    created_at: string;
    user_name: string;
    type: MessageType;
  } | null;
  unread_count: number;
}
