import { createDatabase } from "./client.js";
import { getDatabaseUrl } from "./env.js";
import { createPgliteDatabase } from "./pglite.js";
import { datasetCases, datasets, documents, embeddingModels, models, providers } from "./schema.js";
import { seedDatasets, seedDocuments, seedProviders } from "./seed-data.js";

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

    for (const d of seedDocuments) {
      const existing = await db.query.documents.findFirst({
        where: (r, { eq }) => eq(r.name, d.name),
      });
      if (!existing) {
        await db.insert(documents).values({ name: d.name, content: d.content });
        console.log(`seeded document "${d.name}"`);
      }
    }

    for (const ds of seedDatasets) {
      const existing = await db.query.datasets.findFirst({
        where: (r, { eq }) => eq(r.name, ds.name),
      });
      if (existing) continue;
      const [row] = await db
        .insert(datasets)
        .values({ name: ds.name, target: ds.target, description: ds.description })
        .returning();
      if (!row) throw new Error(`Failed to insert dataset ${ds.name}`);
      await db.insert(datasetCases).values(ds.cases.map((c) => ({ datasetId: row.id, ...c })));
      console.log(`seeded dataset "${ds.name}" (${ds.cases.length} cases)`);
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
