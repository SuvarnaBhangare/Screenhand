// Copyright (C) 2025 Clazro Technology Private Limited
// SPDX-License-Identifier: AGPL-3.0-only
//
// This file is part of ScreenHand.
//
// ScreenHand is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, version 3.
//
// ScreenHand is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with ScreenHand. If not, see <https://www.gnu.org/licenses/>.

export { RecoveryEngine } from "./engine.js";
export type { RecoveryEngineConfig } from "./engine.js";
export { detectBlockers } from "./detectors.js";
export { getBuiltinStrategies, parseReferenceStrategies } from "./strategies.js";
export type {
  BlockerType,
  Blocker,
  RecoveryStrategy,
  RecoveryStep,
  RecoveryBudget,
  RecoveryOutcome,
  RecoveryEvent,
} from "./types.js";
export { DEFAULT_RECOVERY_BUDGET } from "./types.js";
