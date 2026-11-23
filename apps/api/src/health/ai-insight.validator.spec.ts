import { validateAIInsightOutput } from "./ai-insight.validator";

describe("AI insight output validation", () => {
  const allowed = new Set(["health.evidence.openIssues", "bottleneck.PR_NO_ACTIVITY.pr.42"]);

  it("accepts structured evidence-backed observations", () => {
    const output = validateAIInsightOutput({
      summary: "Verified repository activity is stable.",
      keyObservations: [{
        text: "The current issue count is available.",
        evidenceIds: ["health.evidence.openIssues"],
      }],
      supportingEvidenceReferences: ["health.evidence.openIssues"],
      potentialRisks: [{
        text: "No recent PR activity is recorded.",
        evidenceIds: ["bottleneck.PR_NO_ACTIVITY.pr.42"],
      }],
      recommendedActions: [{
        text: "Check whether the pull request remains active.",
        evidenceIds: ["bottleneck.PR_NO_ACTIVITY.pr.42"],
      }],
      confidenceOrDataCompleteness: "Partial data was available.",
    }, allowed);
    expect(output.keyObservations).toHaveLength(1);
  });

  it("rejects unsupported evidence IDs", () => {
    expect(() => validateAIInsightOutput({
      summary: "Unsupported.",
      keyObservations: [{
        text: "A developer has low productivity.",
        evidenceIds: ["person.unsupported"],
      }],
      supportingEvidenceReferences: ["person.unsupported"],
      potentialRisks: [],
      recommendedActions: [],
      confidenceOrDataCompleteness: "Insufficient evidence.",
    }, allowed)).toThrow("unsupported evidence");
  });

  it("rejects observations without evidence", () => {
    expect(() => validateAIInsightOutput({
      summary: "Unsupported.",
      keyObservations: [{ text: "There were 500 commits.", evidenceIds: [] }],
      supportingEvidenceReferences: [],
      potentialRisks: [],
      recommendedActions: [],
      confidenceOrDataCompleteness: "Insufficient evidence.",
    }, allowed)).toThrow("Every AI observation");
  });
});
