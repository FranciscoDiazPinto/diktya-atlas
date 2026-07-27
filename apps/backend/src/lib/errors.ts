export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ReservationConflictError extends HttpError {
  constructor(vlanId: number, sitio: string) {
    super(409, `Ya existe una reserva activa para la VLAN ${vlanId} en el sitio ${sitio}`);
  }
}

export class NotAuthorizedForRoleError extends HttpError {
  constructor(role: string, action: string) {
    super(403, `El rol ${role} no está autorizado para: ${action}`);
  }
}

export class NotFoundError extends HttpError {
  constructor(what: string) {
    super(404, `No encontrado: ${what}`);
  }
}
