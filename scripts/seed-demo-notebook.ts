import { PrismaClient } from "@prisma/client";

import {
  DEMO_USER_EMAIL,
  DEMO_USER_NAME
} from "@/lib/demo-notebook-content";
import { ensureDemoNotebook } from "@/lib/demo-notebook";

const prisma = new PrismaClient();

async function main() {
  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: {
      email: DEMO_USER_EMAIL,
      emailVerified: new Date(0),
      name: DEMO_USER_NAME
    },
    select: {
      id: true,
      email: true
    }
  });

  const result = await ensureDemoNotebook({
    userId: demoUser.id,
    prisma
  });

  console.info(
    "[demo:seed]",
    JSON.stringify({
      event: "seed_demo_notebook_complete",
      demoUserEmail: demoUser.email,
      ...result
    })
  );
}

main()
  .catch((error) => {
    console.error(
      "[demo:seed]",
      JSON.stringify({
        event: "seed_demo_notebook_failed",
        message: error instanceof Error ? error.message : String(error)
      })
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
