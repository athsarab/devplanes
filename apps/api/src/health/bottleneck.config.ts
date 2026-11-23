export type BottleneckSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type BottleneckConfig = {
  thresholds: {
    waitingFirstReviewElapsedHours: number;
    noActivityElapsedHours: number;
    requestedChangesElapsedHours: number;
    stalePullRequestElapsedHours: number;
    issueInactiveElapsedHours: number;
    issueOldElapsedHours: number;
    largeReviewQueue: number;
    reviewTurnaroundIncreaseRatio: number;
  };
  workingHours: {
    timezone: "UTC";
    startHourUtc: number;
    endHourUtc: number;
    weekdaysUtc: number[];
  };
};

export const BOTTLENECK_CONFIG: BottleneckConfig = {
  thresholds: {
    waitingFirstReviewElapsedHours: 48,
    noActivityElapsedHours: 72,
    requestedChangesElapsedHours: 72,
    stalePullRequestElapsedHours: 720,
    issueInactiveElapsedHours: 336,
    issueOldElapsedHours: 1440,
    largeReviewQueue: 10,
    reviewTurnaroundIncreaseRatio: 1.25,
  },
  workingHours: {
    timezone: "UTC",
    startHourUtc: 9,
    endHourUtc: 17,
    weekdaysUtc: [1, 2, 3, 4, 5],
  },
};

export function validateBottleneckConfig(config: BottleneckConfig) {
  for (const value of Object.values(config.thresholds)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Bottleneck thresholds must be positive finite values");
    }
  }
  if (config.workingHours.startHourUtc < 0 ||
      config.workingHours.endHourUtc > 24 ||
      config.workingHours.startHourUtc >= config.workingHours.endHourUtc) {
    throw new Error("Working hours must be a valid UTC interval");
  }
  if (config.workingHours.weekdaysUtc.length === 0 ||
      config.workingHours.weekdaysUtc.some((day) => day < 0 || day > 6)) {
    throw new Error("Working weekdays must contain valid UTC weekday numbers");
  }
}

validateBottleneckConfig(BOTTLENECK_CONFIG);
