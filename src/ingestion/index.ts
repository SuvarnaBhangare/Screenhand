// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only

export { MenuScanner } from "./menu-scanner.js";
export { DocParser } from "./doc-parser.js";
export { TutorialExtractor } from "./tutorial-extractor.js";
export { ReferenceMerger } from "./reference-merger.js";
export { CoverageAuditor } from "./coverage-auditor.js";
export {
  parseShortcutsFromHTML,
  parseShortcutsFromText,
  parseShortcutsFromMarkdown,
  shortcutsToReferenceFormat,
} from "./shortcut-extractor.js";
export type {
  KnowledgeSource,
  KnowledgeSourceType,
  IngestedItem,
  MenuItem,
  MenuScanResult,
  MenuNode,
  ParsedShortcut,
  ParsedFlowStep,
  DocParseResult,
  CoverageReport,
} from "./types.js";
export type {
  TranscriptSegment,
  TutorialExtractResult,
} from "./tutorial-extractor.js";
