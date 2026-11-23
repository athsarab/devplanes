export type AIInsightOutput = {
  summary: string;
  keyObservations: Array<{ text: string; evidenceIds: string[] }>;
  supportingEvidenceReferences: string[];
  potentialRisks: Array<{ text: string; evidenceIds: string[] }>;
  recommendedActions: Array<{ text: string; evidenceIds: string[] }>;
  confidenceOrDataCompleteness: string;
};

export function validateAIInsightOutput(
  value: unknown,
  allowedEvidenceIds: Set<string>,
): AIInsightOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI output must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.summary !== "string" || record.summary.trim().length === 0) {
    throw new Error("AI summary is missing");
  }
  if (!Array.isArray(record.keyObservations) ||
      !Array.isArray(record.potentialRisks) ||
      !Array.isArray(record.recommendedActions) ||
      !Array.isArray(record.supportingEvidenceReferences) ||
      typeof record.confidenceOrDataCompleteness !== "string") {
    throw new Error("AI output structure is incomplete");
  }

  const observations = validateEvidencedItems(record.keyObservations, allowedEvidenceIds);
  const risks = validateEvidencedItems(record.potentialRisks, allowedEvidenceIds);
  const actions = validateEvidencedItems(record.recommendedActions, allowedEvidenceIds);
  const references = record.supportingEvidenceReferences.filter(
    (item): item is string => typeof item === "string",
  );
  if (references.some((id) => !allowedEvidenceIds.has(id))) {
    throw new Error("AI output references unsupported evidence");
  }

  return {
    summary: record.summary,
    keyObservations: observations,
    supportingEvidenceReferences: [...new Set(references)],
    potentialRisks: risks,
    recommendedActions: actions,
    confidenceOrDataCompleteness: record.confidenceOrDataCompleteness,
  };
}

function validateEvidencedItems(
  value: unknown[],
  allowedEvidenceIds: Set<string>,
) {
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("AI output item must be an object");
    }
    const record = item as Record<string, unknown>;
    if (typeof record.text !== "string" || record.text.trim().length === 0 ||
        !Array.isArray(record.evidenceIds)) {
      throw new Error("AI output item is missing text or evidence");
    }
    const evidenceIds = record.evidenceIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (evidenceIds.length === 0 ||
        evidenceIds.some((id) => !allowedEvidenceIds.has(id))) {
      throw new Error("Every AI observation must reference supplied evidence");
    }
    return { text: record.text, evidenceIds: [...new Set(evidenceIds)] };
  });
}
