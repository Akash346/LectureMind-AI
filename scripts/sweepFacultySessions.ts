import { getFacultyConfig } from "@/lib/config/server-env";
import { cleanupFacultySession } from "@/lib/faculty/cleanup";
import { prisma } from "@/lib/prisma";

async function main() {
  const config = getFacultyConfig();
  const inactivityCutoff = new Date(
    Date.now() - config.sessionTtlMinutes * 60_000
  );
  const sessions = await prisma.facultySession.findMany({
    where: {
      deletedAt: null,
      OR: [
        { expiresAt: { lt: new Date() } },
        { lastActiveAt: { lt: inactivityCutoff } }
      ]
    },
    select: { id: true }
  });

  for (const session of sessions) {
    await cleanupFacultySession({
      sessionId: session.id,
      reason: "expired"
    });
  }

  console.info(
    "[faculty:sweep]",
    JSON.stringify({
      cleaned: sessions.length
    })
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
