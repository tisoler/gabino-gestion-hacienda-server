import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { FirebaseStrategy } from "./strategies/firebase.strategy";
import { AuthController } from "./auth.controller";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "firebase" })],
  providers: [FirebaseStrategy],
  controllers: [AuthController],
  exports: [PassportModule],
})
export class AuthModule {}
