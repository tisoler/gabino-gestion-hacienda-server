import { Global, Module } from "@nestjs/common";
import { FirestoreCacheService } from "./firestore-cache.service";
import { CacheController } from "./cache.controller";

@Global()
@Module({
  providers: [FirestoreCacheService],
  controllers: [CacheController],
  exports: [FirestoreCacheService],
})
export class CacheModule {}
