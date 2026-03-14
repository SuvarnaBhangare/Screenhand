// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

/** A playbook shared to the community repository. */
export interface SharedPlaybook {
  id: string;
  name: string;
  description: string;
  platform: string;
  bundleId: string;
  version: string;
  steps: SharedStep[];
  metadata: ContributionMeta;
  ratings: PlaybookRating;
}

export interface SharedStep {
  action: string;
  tool: string;
  params: Record<string, unknown>;
  description: string;
  postcondition?: string;
}

export interface ContributionMeta {
  author: string;
  publishedAt: string;
  updatedAt: string;
  appVersion?: string;
  os: string;
  successRate: number;
  executionCount: number;
  tags: string[];
}

export interface PlaybookRating {
  upvotes: number;
  downvotes: number;
  score: number;
  reportCount: number;
}

/** Query for fetching community playbooks. */
export interface PlaybookQuery {
  platform?: string;
  bundleId?: string;
  workflow?: string;
  minScore?: number;
  limit?: number;
}

/** Result of validating a community playbook locally. */
export interface ValidationResult {
  playbook: SharedPlaybook;
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  errors: string[];
  validatedAt: string;
}
