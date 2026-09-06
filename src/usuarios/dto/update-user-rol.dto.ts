import { IsIn } from "class-validator";
import { ID_ROL_ASIGNABLES } from "../../constantes";

export class UpdateUserRolDto {
  @IsIn(ID_ROL_ASIGNABLES, {
    message: "El rol debe ser anfitrión, operario o cliente",
  })
  idRol: number;
}
