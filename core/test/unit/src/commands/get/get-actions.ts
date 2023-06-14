/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Bluebird from "bluebird"
import { expect } from "chai"
import { getActionState, getRelativeActionConfigPath } from "../../../../../src/actions/helpers"
import { GetActionsCommand } from "../../../../../src/commands/get/get-actions"
import { TestGarden, getDataDir, makeTestGarden, withDefaultGlobalOpts } from "../../../../helpers"
import { Action } from "../../../../../src/actions/types"
import { ActionRouter } from "../../../../../src/router/router"
import { ResolvedConfigGraph } from "../../../../../src/graph/config-graph"
import { Log } from "../../../../../src/logger/log-entry"
import { sortBy } from "lodash"

export const getActionsToSimpleOutput = (d) => {
  return { name: d.name, kind: d.kind, type: d.type }
}

export const getActionsToSimpleWithStateOutput = async (
  a: Action,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
) => {
  {
    return {
      name: a.name,
      kind: a.kind,
      type: a.type,
      state: await getActionState(a, router, graph, log),
    }
  }
}

export const getActionsToDetailedOutput = (a: Action, garden: TestGarden, graph: ResolvedConfigGraph) => {
  return {
    name: a.name,
    kind: a.kind,
    type: a.type,
    path: getRelativeActionConfigPath(garden.projectRoot, a),
    dependencies: a
      .getDependencies()
      .map((d) => d.key())
      .sort(),
    dependents: graph
      .getDependants({ kind: a.kind, name: a.name, recursive: false })
      .map((d) => d.key())
      .sort(),
    disabled: a.isDisabled(),
    moduleName: a.moduleName() ?? undefined,
  }
}

export const getActionsToDetailedWithStateOutput = async (
  a: Action,
  garden: TestGarden,
  router: ActionRouter,
  graph: ResolvedConfigGraph,
  log: Log
) => {
  {
    return {
      name: a.name,
      kind: a.kind,
      type: a.type,
      path: getRelativeActionConfigPath(garden.projectRoot, a),
      state: await getActionState(a, router, graph, log),
      dependencies: a
        .getDependencies()
        .map((d) => d.key())
        .sort(),
      dependents: graph
        .getDependants({ kind: a.kind, name: a.name, recursive: false })
        .map((d) => d.key())
        .sort(),
      disabled: a.isDisabled(),
      moduleName: a.moduleName() ?? undefined,
    }
  }
}

describe("GetActionsCommand", () => {
  const projectRoot = getDataDir("test-project-b")

  it("should run without errors when called without arguments", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false, "kind": "" }),
    })
  })

  it("should run without errors when called with a list of action names", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    await command.action({
      garden,
      log,
      args: { names: ["task-a"] },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
    })
  })

  it("should return all actions in a project", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "" }),
    })

    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), "name")

    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result?.actions).to.eql(expected)
  })

  it("should return all actions in a project with additional info when --detail is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const expected = sortBy(
      graph.getActions().map((a) => getActionsToDetailedOutput(a, garden, graph)),
      "name"
    )
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions in a project with state when --include-state is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(
      await Bluebird.map(graph.getActions(), async (a) => getActionsToSimpleWithStateOutput(a, router, graph, log)),
      "name"
    )
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return specific actions in a project with state when --include-state is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const args = { names: ["task-a", "module-b"] }

    const { result } = await command.action({
      garden,
      log,
      args,
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(
      await Bluebird.map(graph.getActions({ refs: args.names }), async (a) =>
        getActionsToSimpleWithStateOutput(a, router, graph, log)
      ),
      "name"
    )
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions in a project with additional fields and state when --include-state and --detail are set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": true, "sort": "name", "include-state": true, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(
      await Bluebird.map(graph.getActions(), async (a) =>
        getActionsToDetailedWithStateOutput(a, garden, router, graph, log)
      ),
      "name"
    )
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions of specific kind in a project when --kind is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "name", "include-state": false, "kind": "deploy" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(graph.getDeploys().map(getActionsToSimpleOutput), "name")
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions sorted by kind and name when --sort=kind is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "kind", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), ["kind", "name"])
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })

  it("should return all actions sorted by type and name when --sort=type is set", async () => {
    const garden = await makeTestGarden(projectRoot)
    const log = garden.log
    const command = new GetActionsCommand()

    const { result } = await command.action({
      garden,
      log,
      args: { names: undefined },
      opts: withDefaultGlobalOpts({ "detail": false, "sort": "type", "include-state": false, "kind": "" }),
    })
    const graph = await garden.getResolvedConfigGraph({ log, emit: false })
    const router = await garden.getActionRouter()
    const expected = sortBy(graph.getActions().map(getActionsToSimpleOutput), ["type", "name"])
    expect(command.outputsSchema().validate(result).error).to.be.undefined
    expect(result).to.eql({ actions: expected })
  })
})
