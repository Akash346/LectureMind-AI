"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { preferenceSchema } from "@/lib/validators";

export type PreferenceState = {
  ok?: boolean;
  error?: string;
};

export async function savePreferences(
  _previousState: PreferenceState,
  formData: FormData
): Promise<PreferenceState> {
  const user = await requireUser();
  const parsed = preferenceSchema.safeParse({
    theme: formData.get("theme"),
    defaultLanguage: formData.get("defaultLanguage"),
    chatMode: formData.get("chatMode"),
    responseLength: formData.get("responseLength")
  });

  if (!parsed.success) {
    return {
      error: "Choose valid preference values."
    };
  }

  await prisma.userPreference.upsert({
    where: {
      userId: user.id
    },
    create: {
      userId: user.id,
      ...parsed.data
    },
    update: parsed.data
  });

  revalidatePath("/dashboard");
  revalidatePath("/notebooks");

  return { ok: true };
}

export async function saveDefaultLanguage(formData: FormData) {
  const user = await requireUser();
  const parsed = preferenceSchema
    .pick({ defaultLanguage: true })
    .safeParse({ defaultLanguage: formData.get("defaultLanguage") });

  if (!parsed.success) {
    return;
  }

  await prisma.userPreference.upsert({
    where: {
      userId: user.id
    },
    create: {
      userId: user.id,
      defaultLanguage: parsed.data.defaultLanguage
    },
    update: {
      defaultLanguage: parsed.data.defaultLanguage
    }
  });

  revalidatePath("/notebooks");
}
