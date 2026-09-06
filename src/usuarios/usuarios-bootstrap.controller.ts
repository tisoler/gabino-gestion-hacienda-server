import { Controller, Post, Request, Body, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UsuariosService } from "./usuarios.service";
import { BootstrapUsuarioDto } from "./dto/bootstrap-usuario.dto";
import { FirebaseBootstrapGuard } from "../auth/guards/firebase-bootstrap.guard";

/**
 * Controller separado de UsuariosController para el bootstrap: no lleva los
 * guards de clase (FirebaseGuard + PermissionsGuard + RolesGuard) porque el
 * documento del usuario recién se va a crear y FirebaseGuard lo rechazaría.
 */
@ApiTags("usuarios")
@Controller("usuarios")
export class UsuariosBootstrapController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post("bootstrap")
  @UseGuards(FirebaseBootstrapGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Crea el documento del usuario en Firestore si no existe (signup)",
    description:
      "El usuario nuevo queda sin rol (idRol: null) hasta que sys-admin le asigne " +
      "anfitrión, cliente u operario. Acepta opcionalmente el celular (WhatsApp) " +
      "cargado en el formulario de registro.",
  })
  bootstrap(@Request() req, @Body() dto: BootstrapUsuarioDto) {
    return this.usuariosService.bootstrapUsuario(req.user, dto?.celular);
  }
}
