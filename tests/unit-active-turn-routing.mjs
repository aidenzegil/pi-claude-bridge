// Unit tests for active-turn delivery routing (query-state.ts).
//
// Pi calls the provider from its own async chain, so an in-flight query's
// follow-up streamSimple calls (tool-result delivery, steers) arrive OUTSIDE
// the ALS slot created for the query's first call. runInActiveTurnStore lets
// those entries rejoin the single active turn's slot; without it they'd get a
// fresh context, see activeQuery=null, and treat every tool result as orphaned.

import { test, beforeEach } from "node:test";
import assert from "node:assert";
import {
	ctx,
	resetStack,
	runWithFreshTurnContext,
	currentTurnStore,
	registerActiveTurnStore,
	unregisterActiveTurnStore,
	runInActiveTurnStore,
} from "../src/query-state.js";

beforeEach(() => resetStack());

test("no registered turn → does not run (caller falls back to fresh context)", () => {
	const routed = runInActiveTurnStore(() => ctx());
	assert.strictEqual(routed.ran, false);
});

test("single registered turn with active query → rejoins its context", () => {
	let turnCtx, turnStore;
	runWithFreshTurnContext(() => {
		turnCtx = ctx();
		turnCtx.activeQuery = { fake: true };
		turnStore = currentTurnStore();
		registerActiveTurnStore(turnStore);
	});
	// Out-of-scope entry (pi's chain): must land in the SAME context.
	const routed = runInActiveTurnStore(() => ctx());
	assert.strictEqual(routed.ran, true);
	assert.strictEqual(routed.result, turnCtx);
	unregisterActiveTurnStore(turnStore);
	assert.strictEqual(runInActiveTurnStore(() => ctx()).ran, false);
});

test("registered turn without an active query → does not run", () => {
	runWithFreshTurnContext(() => {
		registerActiveTurnStore(currentTurnStore());
	});
	assert.strictEqual(runInActiveTurnStore(() => ctx()).ran, false);
});

test("two concurrent registered turns → ambiguous, does not run", () => {
	for (let i = 0; i < 2; i++) {
		runWithFreshTurnContext(() => {
			ctx().activeQuery = { fake: i };
			registerActiveTurnStore(currentTurnStore());
		});
	}
	assert.strictEqual(runInActiveTurnStore(() => ctx()).ran, false);
});

test("unregister is idempotent and tolerates undefined", () => {
	unregisterActiveTurnStore(undefined);
	registerActiveTurnStore(undefined);
	assert.strictEqual(runInActiveTurnStore(() => ctx()).ran, false);
});
