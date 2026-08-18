import { diffSchemas, summarizeChange, worstSeverity } from "@schema-watch/core";
import type { BodyTarget as CoreBodyTarget, ChangeSeverity, SchemaChange, SchemaNode } from "@schema-watch/core";
import { hashSchema } from "@schema-watch/core/node";
import type { Prisma, BodyTarget as PrismaBodyTarget } from "@prisma/client";
import { prisma } from "./prisma.js";
import { notifyProject } from "./notify/index.js";

export interface IngestParams {
  projectId: string;
  projectName: string;
  method: string;
  pathPattern: string;
  target: CoreBodyTarget;
  statusCode?: number;
  schema: SchemaNode;
  affectedFiles?: string[];
}

export interface IngestResult {
  endpointId: string;
  change: {
    id: string;
    severity: ChangeSeverity;
    changes: SchemaChange[];
    affectedFiles: string[];
  } | null;
}

const toPrismaTarget = (t: CoreBodyTarget): PrismaBodyTarget => t.toUpperCase() as PrismaBodyTarget;

/**
 * The same "diff against the last known shape" logic the local agent runs,
 * reused server-side for cloud-synced snapshots and CI checks so there is
 * exactly one implementation of "what counts as a breaking change."
 * Note: the server only ever receives inferred schema *shapes*, never raw
 * request/response bodies - customer payload data never leaves their machine.
 */
export async function ingestSnapshot(params: IngestParams): Promise<IngestResult> {
  const endpoint = await prisma.endpoint.upsert({
    where: {
      projectId_method_pathPattern: {
        projectId: params.projectId,
        method: params.method,
        pathPattern: params.pathPattern,
      },
    },
    create: { projectId: params.projectId, method: params.method, pathPattern: params.pathPattern },
    update: {},
  });

  const hash = hashSchema(params.schema);
  const target = toPrismaTarget(params.target);

  const previous = await prisma.schemaSnapshot.findFirst({
    where: { endpointId: endpoint.id, target },
    orderBy: { createdAt: "desc" },
  });

  if (previous?.hash === hash) {
    return { endpointId: endpoint.id, change: null };
  }

  const snapshot = await prisma.schemaSnapshot.create({
    data: {
      endpointId: endpoint.id,
      target,
      statusCode: params.statusCode,
      schema: params.schema as unknown as Prisma.InputJsonValue,
      hash,
    },
  });

  if (!previous) {
    return { endpointId: endpoint.id, change: null };
  }

  const changes = diffSchemas(previous.schema as unknown as SchemaNode, params.schema, params.target);
  if (changes.length === 0) return { endpointId: endpoint.id, change: null };

  const severity = worstSeverity(changes)!;
  const affectedFiles = params.affectedFiles ?? [];

  const changeRow = await prisma.contractChange.create({
    data: {
      endpointId: endpoint.id,
      severity,
      target,
      summary: summarizeChange(changes[0]!),
      changes: changes as unknown as Prisma.InputJsonValue,
      affectedFiles: affectedFiles as unknown as Prisma.InputJsonValue,
      fromSnapshotId: previous.id,
      toSnapshotId: snapshot.id,
    },
  });

  // Never let a broken webhook fail the ingest that triggered it.
  await notifyProject(params.projectId, {
    projectName: params.projectName,
    method: params.method,
    pathPattern: params.pathPattern,
    target: params.target,
    severity,
    changes,
    affectedFiles,
  }).catch(() => {});

  return { endpointId: endpoint.id, change: { id: changeRow.id, severity, changes, affectedFiles } };
}
