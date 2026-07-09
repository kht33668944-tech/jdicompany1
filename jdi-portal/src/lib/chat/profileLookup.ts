import type { ApprovedProfile } from "./types";

export interface ChatProfileSummary {
  full_name: string;
  avatar_url: string | null;
}

export function buildApprovedProfileMap(
  profiles: ApprovedProfile[]
): Map<string, ChatProfileSummary> {
  return new Map(
    profiles.map((profile) => [
      profile.id,
      {
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
      },
    ])
  );
}
