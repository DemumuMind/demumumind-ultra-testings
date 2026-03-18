#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal workflow query tool for Shannon.
 *
 * Displays workflow execution metadata and live pipeline progress when the
 * workflow is still running.
 *
 * Usage:
 *   node dist/temporal/query.js <workflow-id>
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
import type { WorkflowExecutionDescription } from '@temporalio/client';

import type { PipelineProgress } from './shared.js';

const PROGRESS_QUERY = 'getProgress';

function showUsage(): void {
  console.log('\nShannon Workflow Query');
  console.log('Inspect workflow state and live progress\n');
  console.log('Usage:');
  console.log('  node dist/temporal/query.js <workflow-id>\n');
}

function formatTimestamp(value: Date | null | undefined): string {
  if (!value) return 'n/a';
  return value.toISOString();
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function printDescription(
  workflowId: string,
  description: WorkflowExecutionDescription
): void {
  console.log('\n=== Shannon Workflow ===\n');
  console.log(`Workflow ID: ${workflowId}`);
  console.log(`Status:      ${description.status.name}`);
  console.log(`Type:        ${description.type}`);
  console.log(`Task Queue:  ${description.taskQueue}`);
  console.log(`Run ID:      ${description.runId}`);
  console.log(`Started:     ${formatTimestamp(description.startTime)}`);
  console.log(`Closed:      ${formatTimestamp(description.closeTime)}`);
  console.log();
}

function printProgress(progress: PipelineProgress): void {
  console.log('=== Live Progress ===\n');
  console.log(`Current phase:   ${progress.currentPhase ?? 'n/a'}`);
  console.log(`Current agent:   ${progress.currentAgent ?? 'n/a'}`);
  console.log(`Completed:       ${progress.completedAgents.length}/13`);
  console.log(`Elapsed:         ${formatDuration(progress.elapsedMs)}`);

  if (progress.failedAgent) {
    console.log(`Failed agent:    ${progress.failedAgent}`);
  }
  if (progress.error) {
    console.log(`Error:           ${progress.error}`);
  }

  if (progress.summary) {
    console.log(`Total turns:     ${progress.summary.totalTurns}`);
    console.log(`Run cost:        $${progress.summary.totalCostUsd.toFixed(4)}`);
    console.log(`Duration:        ${formatDuration(progress.summary.totalDurationMs)}`);
  }

  console.log();
}

async function queryWorkflow(workflowId: string): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    printDescription(workflowId, description);

    try {
      const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);
      printProgress(progress);
    } catch {
      console.log('No live progress query available for this workflow.\n');
    }
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      console.error(`Workflow not found: ${workflowId}`);
      process.exit(1);
    }
    throw error;
  } finally {
    await connection.close();
  }
}

async function main(): Promise<void> {
  const [workflowId] = process.argv.slice(2);

  if (!workflowId || workflowId === '--help' || workflowId === '-h') {
    showUsage();
    process.exit(workflowId ? 0 : 1);
  }

  await queryWorkflow(workflowId);
}

main().catch((error) => {
  console.error('Query error:', error);
  process.exit(1);
});
