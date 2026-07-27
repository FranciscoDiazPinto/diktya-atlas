import { Prisma, type VlanReservation as PrismaVlanReservation } from "@prisma/client";
import type { VlanPlan } from "@diktya-atlas/shared";
import { prisma } from "../db/client.js";
import { ReservationConflictError, NotFoundError } from "../lib/errors.js";

export interface ReserveVlanInput {
  vlanId: number;
  sitio: string;
  redSolicitada: string;
  reservadoPorId: string;
  plan: VlanPlan;
}

/**
 * Reservar es un INSERT con constraint de unicidad sobre (vlanId, sitio,
 * estado=RESERVADA) — ver @@unique([vlanId, sitio, estado]) en el schema.
 * Si ya existe una reserva activa, Prisma lanza P2002 y la traducimos a
 * 409: NUNCA reintentamos silenciosamente sobre la reserva existente.
 */
export async function reserveVlan(input: ReserveVlanInput): Promise<PrismaVlanReservation> {
  try {
    return await prisma.vlanReservation.create({
      data: {
        vlanId: input.vlanId,
        sitio: input.sitio,
        redSolicitada: input.redSolicitada,
        reservadoPorId: input.reservadoPorId,
        planSnapshot: input.plan as unknown as Prisma.InputJsonValue,
        estado: "RESERVADA",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ReservationConflictError(input.vlanId, input.sitio);
    }
    throw err;
  }
}

export async function getReservation(id: string): Promise<PrismaVlanReservation> {
  const reservation = await prisma.vlanReservation.findUnique({ where: { id } });
  if (!reservation) throw new NotFoundError(`vlan_reservation ${id}`);
  return reservation;
}

export async function markApplied(id: string): Promise<PrismaVlanReservation> {
  return prisma.vlanReservation.update({ where: { id }, data: { estado: "APLICADA" } });
}

export async function releaseReservation(id: string): Promise<PrismaVlanReservation> {
  return prisma.vlanReservation.update({ where: { id }, data: { estado: "LIBERADA" } });
}
