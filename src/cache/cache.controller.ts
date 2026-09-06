import { Controller, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { FirestoreCacheService } from "./firestore-cache.service";
import { FirebaseGuard } from "../auth/guards/firebase.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Roles as RolesConst } from "../constantes";

@ApiTags("cache")
@Controller("cache")
@UseGuards(FirebaseGuard, RolesGuard)
@ApiBearerAuth()
export class CacheController {
  constructor(private readonly cache: FirestoreCacheService) {}

  @Post("invalidate")
  @Roles(RolesConst.SYS_ADMIN)
  @ApiOperation({
    summary:
      "Limpiar todos los caches (auth por usuario y listado de usuarios)",
  })
  invalidate() {
    this.cache.invalidateAll();
    return { ok: true };
  }
}
