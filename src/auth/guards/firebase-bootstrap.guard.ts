import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as admin from "firebase-admin";
import { ExtractJwt } from "passport-jwt";

/**
 * Guard para el bootstrap de usuarios nuevos (POST /usuarios/bootstrap).
 *
 * A diferencia de FirebaseGuard, NO requiere que el documento del usuario
 * exista en Firestore (recién se va a crear): sólo verifica el ID token.
 */
@Injectable()
export class FirebaseBootstrapGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (!token) {
      throw new UnauthorizedException("Token no proporcionado");
    }
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = {
        id: decoded.uid,
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Error al validar token de Firebase");
    }
  }
}
