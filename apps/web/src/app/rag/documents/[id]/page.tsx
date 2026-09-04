import {
  ApiError,
  api,
  type DocumentSummary,
  type EmbeddingModelSummary,
} from "../../../../lib/api-client";
import { DocumentWorkspace } from "../../../../components/document-workspace";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let document: DocumentSummary | null = null;
  let embeddingModels: EmbeddingModelSummary[] = [];
  let error: string | null = null;
  try {
    [document, { embeddingModels }] = await Promise.all([api.document(id), api.embeddingModels()]);
  } catch (err) {
    error =
      err instanceof ApiError && err.status === 404
        ? "Document not found"
        : "Failed to reach the API";
  }

  if (error || !document) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document</h1>
        <p className="mt-4 text-sm text-zinc-500">{error ?? "Not found"}.</p>
      </div>
    );
  }

  return <DocumentWorkspace document={document} embeddingModels={embeddingModels} />;
}
