import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { SupabaseAuthService } from "./supabase-auth.service";
import { DevScopeSessionGuard } from "./devscope-session.guard";

@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthService, DevScopeSessionGuard],
  exports: [SupabaseAuthService, DevScopeSessionGuard],
})
export class AuthModule {}
