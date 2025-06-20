import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { AuthService } from "./auth.service"
import { AuthController } from "./auth.controller"
import { JwtAuthGuard } from "./guards/jwt-auth.guard"
import { RolesGuard } from "./guards/roles.guard"
import { UsersModule } from "../User/user.module"
import { TwilioModule } from "../twillio/twillio.module"
import { CacheModule } from "../cache/cache.module"
import { JwtStrategy } from "./jwt.strategie"

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    TwilioModule,
    CacheModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: "15m", // Durée par défaut pour l'access token
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard,JwtStrategy],
  exports: [AuthService, JwtAuthGuard, JwtModule, CacheModule],
})
export class AuthModule {}
