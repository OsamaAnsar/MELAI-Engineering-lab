import { createDatabase } from "./client.js";
import { getDatabaseUrl } from "./env.js";
import { createPgliteDatabase } from "./pglite.js";
import { embeddingModels, models, providers } from "./schema.js";
import { seedProviders } from "./seed-data.js";

async function seed(): Promise<void> {
  const { db, close } =
    process.env.DB_DRIVER === "pglite"
      ? await createPgliteDatabase()
      : createDatabase(getDatabaseUrl(), { max: 1 });

  try {
    for (const p of seedProviders) {
      const [provider] = await db
        .insert(providers)
        .values({ name: p.name, kind: p.kind, config: p.config })
        .onConflictDoNothing({ target: providers.name })
        .returning();

      const providerRow =
        provider ??
        (await db.query.providers.findFirst({ where: (r, { eq }) => eq(r.name, p.name) }));

      if (!providerRow) throw new Error(`Failed to upsert provider ${p.name}`);

      for (const m of p.models) {
        await db
          .insert(models)
          .values({ providerId: providerRow.id, ...m })
          .onConflictDoNothing({ target: [models.providerId, models.name] });
      }

      for (const m of p.embeddingModels ?? []) {
        await db
          .insert(embeddingModels)
          .values({ providerId: providerRow.id, ...m })
          .onConflictDoNothing({ target: [embeddingModels.providerId, embeddingModels.name] });
      }

      console.log(
        `seeded ${p.name} (${p.models.length} model(s), ${(p.embeddingModels ?? []).length} embedding model(s))`,
      );
    }
  } finally {
    await close();
  }
}

seed()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
