import type { TeamRole } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function requireMembership(userId: string, teamId: string, roles: TeamRole[]) {
  const membership = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  return membership && roles.includes(membership.role) ? membership : null;
}
