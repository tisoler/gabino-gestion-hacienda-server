import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string | string[]>(
      "permission",
      context.getHandler(),
    );

    if (!required || (Array.isArray(required) && required.length === 0)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Usuario no autenticado");
    }

    const lista = Array.isArray(required) ? required : [required];
    const hasPermission = lista.some((p) => user.permisos?.includes(p));

    if (!hasPermission) {
      throw new ForbiddenException(`No tiene permiso: ${lista.join(" o ")}`);
    }

    return true;
  }
}
