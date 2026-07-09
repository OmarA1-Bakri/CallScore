import * as assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const DISPATCHER = "/srv/agents/hermes/scripts/callscore-autonomy-board-dispatch.sh";
const PROGRESS = "/srv/agents/hermes/scripts/callscore-autonomy-progress-report.sh";
const MEDIA_DISPATCHER = "/srv/agents/hermes/scripts/callscore-cmo-media-gate-board-dispatch.sh";
const dispatcherExists = existsSync(DISPATCHER);

test("archived CallScore autonomy dispatcher cannot fall through to the current Kanban board", { skip: !dispatcherExists }, () => {
  const source = readFileSync(DISPATCHER, "utf8");
  assert.match(source, /BOARD="\$\{CALLSCORE_AUTONOMY_BOARD:-callscore-autonomy-20260621\}"/);
  assert.match(source, /hermes kanban --board "\$BOARD" dispatch --max 10 --json/);
  assert.doesNotMatch(source, /export HERMES_KANBAN_BOARD=/);
});

test("archived autonomy progress reporter reads its board explicitly", { skip: !existsSync(PROGRESS) }, () => {
  const source = readFileSync(PROGRESS, "utf8");
  assert.match(source, /\["hermes", "kanban", "--board", board, "list"\]/);
  assert.doesNotMatch(source, /HERMES_KANBAN_BOARD/);
});

test("CMO media dispatcher cannot fall through to the current Kanban board", { skip: !existsSync(MEDIA_DISPATCHER) }, () => {
  const source = readFileSync(MEDIA_DISPATCHER, "utf8");
  assert.match(source, /hermes kanban --board "\$BOARD" dispatch --max 1 --json/);
  assert.doesNotMatch(source, /export HERMES_KANBAN_BOARD=/);
});
