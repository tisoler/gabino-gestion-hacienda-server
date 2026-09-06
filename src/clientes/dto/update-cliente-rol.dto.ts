import { IsIn } from "class-validator";

export class UpdateClienteRolDto {
  @IsIn(["operario"], { message: "Solo se admite el rol 'operario'" })
  rol: string;
}
