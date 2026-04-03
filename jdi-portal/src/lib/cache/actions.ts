"use server";

import { revalidateTag } from "next/cache";

export async function revalidateTasksCache() {
  revalidateTag("tasks", "max");
}

export async function revalidateProfilesCache() {
  revalidateTag("profiles", "max");
}
